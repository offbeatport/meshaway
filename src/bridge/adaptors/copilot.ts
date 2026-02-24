/**
 * Copilot client (GitHub Copilot SDK): client speaks the Copilot CLI protocol.
 * This adapter implements the JSON-RPC surface that the SDK expects and
 * forwards conversation work to an ACP agent.
 */

import { genId } from "../../shared/ids.js";
import { VERSION } from "../../shared/constants.js";
import { CopilotPromptParamsSchema } from "../../protocols/copilot/types.js";
import { assertSchema } from "../../protocols/assert.js";
import { redactPayload } from "../interceptors/redaction.js";
import { BridgeAdapter } from "./base.js";
import type { BridgeResponse, JsonRpcId } from "./types.js";
import { log } from "../../shared/logging.js";

type CopilotHandler = (id: JsonRpcId, params: unknown) => BridgeResponse | Promise<BridgeResponse>;

const GITHUB_AGENT_RUNTIME_VERSION = 2;

export class CopilotAdapter extends BridgeAdapter {
  private readonly handlers: Record<string, CopilotHandler> = {
    "ping": (id, params) => this.handlePing(id, params),
    "status.get": (id) => this.handleStatusGet(id),
    "tools.list": (id) => this.handleToolsList(id),
    "account.getQuota": (id) => this.handleAccountGetQuota(id),
    "session.create": (id, params) => this.handleSessionCreate(id, params),
    "session.send": (id, params) => this.handleSessionSend(id, params),
    "session.destroy": (id, params) => this.handleSessionDestroy(id, params),
    "session.abort": (id, params) => this.handleSessionAbort(id, params),
    "session.delete": (id, params) => this.handleSessionDelete(id, params),
    "session.model.getCurrent": (id, params) => this.handleSessionModelGetCurrent(id, params),
    "session.model.switchTo": (id, params) => this.handleSessionModelSwitchTo(id, params),
    "session.mode.get": (id, params) => this.handleSessionModeGet(id, params),
    "session.mode.set": (id, params) => this.handleSessionModeSet(id, params),
    "session.plan.read": (id, params) => this.handleSessionPlanRead(id, params),
    "session.plan.update": (id, params) => this.handleSessionPlanUpdate(id, params),
    "session.plan.delete": (id, params) => this.handleSessionPlanDelete(id, params),
    "session.workspace.listFiles": (id, params) => this.handleSessionWorkspaceListFiles(id, params),
    "session.workspace.readFile": (id, params) => this.handleSessionWorkspaceReadFile(id, params),
    "session.workspace.createFile": (id, params) => this.handleSessionWorkspaceCreateFile(id, params),
    "session.fleet.start": (id, params) => this.handleSessionFleetStart(id, params),
    prompt: (id, params) => this.handlePrompt(id, params),
    cancel: (id, params) => this.handleCancel(id, params),
  };

  supportedMethods(): readonly string[] {
    return Object.keys(this.handlers);
  }

  async handle(id: JsonRpcId, method: string, params: unknown): Promise<BridgeResponse> {
    const handler = this.handlers[method];
    // log.info(params, `REQ: ${method}`);
    if (!handler) return this.error(id, -32601, `Method not implemented: ${method}`);

    const resp = await handler(id, params);
    // log.info(resp, "RESP: handled method");
    return resp;

  }

  // --- Server-scoped methods -------------------------------------------------

  private async handlePing(id: JsonRpcId, params: unknown): Promise<BridgeResponse> {
    const rec = (params ?? {}) as { message?: unknown };
    const message = typeof rec.message === "string" ? rec.message : "ok";

    await this.requestAgent("initialize", {
      protocolVersion: 1,
      clientCapabilities: {},
      clientInfo: { name: "meshaway-copilot-bridge", version: VERSION },
    });

    return this.result(id, {
      message,
      timestamp: Date.now(),
      protocolVersion: GITHUB_AGENT_RUNTIME_VERSION,
    });
  }

  private handleStatusGet(id: JsonRpcId): BridgeResponse {
    return this.result(id, {
      version: VERSION,
      protocolVersion: GITHUB_AGENT_RUNTIME_VERSION,
    });
  }

  private handleToolsList(id: JsonRpcId): BridgeResponse {
    // No built-in tools exposed from the bridge for now.
    return this.result(id, { tools: [] });
  }

  private handleAccountGetQuota(id: JsonRpcId): BridgeResponse {
    return this.result(id, { quotaSnapshots: {} });
  }

  // --- Session lifecycle & messaging -----------------------------------------

  private async handleSessionCreate(id: JsonRpcId, params: unknown): Promise<BridgeResponse> {
    const rec = (params ?? {}) as Record<string, unknown>;
    const localSessionId =
      typeof rec.sessionId === "string" && rec.sessionId.length > 0
        ? rec.sessionId
        : genId("sess");
    this.ensureSession(localSessionId);
    if (!this.getLocalToAgentSession().has(localSessionId)) {
      const newSessionResult = (await this.requestAgent("session/new", {
        cwd: process.cwd(),
        mcpServers: rec.mcpServers ?? [],
      })) as Record<string, unknown> | undefined;

      const agentSessionId =
        typeof newSessionResult?.sessionId === "string"
          ? newSessionResult.sessionId
          : localSessionId;
      this.setLocalToAgentSession(localSessionId, agentSessionId);
    }

    return this.result(id, {
      sessionId: localSessionId,
      workspacePath: null,
    });
  }

  private async handleSessionSend(id: JsonRpcId, params: unknown): Promise<BridgeResponse> {
    // The SDK uses session.send; we reuse the prompt flow.
    return this.handlePrompt(id, params);
  }

  private handleSessionDestroy(id: JsonRpcId, params: unknown): BridgeResponse {
    const rec = (params ?? {}) as Record<string, unknown>;
    const sessionId = typeof rec.sessionId === "string" ? rec.sessionId : undefined;
    if (sessionId) {
      this.updateSessionStatus(sessionId, "completed");
    }
    return this.result(id, { ok: true });
  }

  private async handleSessionAbort(id: JsonRpcId, params: unknown): Promise<BridgeResponse> {
    const rec = (params ?? {}) as Record<string, unknown>;
    const localSessionId = typeof rec.sessionId === "string" ? rec.sessionId : undefined;
    if (localSessionId) {
      const agentSessionId = this.resolveAgentSessionId(localSessionId);
      try {
        await this.requestAgent("session/cancel", { sessionId: agentSessionId });
      } catch {
        // Agent may not support session/cancel; still return ok
      }
      this.updateSessionStatus(localSessionId, "completed");
    }
    return this.result(id, { ok: true });
  }

  private handleSessionDelete(id: JsonRpcId, params: unknown): BridgeResponse {
    const rec = (params ?? {}) as Record<string, unknown>;
    const sessionId = typeof rec.sessionId === "string" ? rec.sessionId : undefined;
    if (sessionId) {
      this.getLocalToAgentSession().delete(sessionId);
      this.updateSessionStatus(sessionId, "killed");
    }
    return this.result(id, {});
  }

  // --- Session configuration / workspace helpers -----------------------------

  private handleSessionModelGetCurrent(id: JsonRpcId, params: unknown): BridgeResponse {
    const rec = (params ?? {}) as Record<string, unknown>;
    const _sessionId = typeof rec.sessionId === "string" ? rec.sessionId : undefined;
    // We don't track per-session model; return undefined modelId.
    return this.result(id, { modelId: undefined });
  }

  private handleSessionModelSwitchTo(id: JsonRpcId, params: unknown): BridgeResponse {
    const rec = (params ?? {}) as Record<string, unknown>;
    const modelId = typeof rec.modelId === "string" ? rec.modelId : undefined;
    return this.result(id, { modelId });
  }

  private handleSessionModeGet(id: JsonRpcId, params: unknown): BridgeResponse {
    return this.result(id, { mode: "interactive" as const });
  }

  private handleSessionModeSet(id: JsonRpcId, params: unknown): BridgeResponse {
    const rec = (params ?? {}) as Record<string, unknown>;
    const mode =
      rec.mode === "plan" || rec.mode === "autopilot" ? (rec.mode as string) : "interactive";
    return this.result(id, { mode });
  }

  private handleSessionPlanRead(id: JsonRpcId, _params: unknown): BridgeResponse {
    return this.result(id, { exists: false, content: null });
  }

  private handleSessionPlanUpdate(id: JsonRpcId, _params: unknown): BridgeResponse {
    return this.result(id, {});
  }

  private handleSessionPlanDelete(id: JsonRpcId, _params: unknown): BridgeResponse {
    return this.result(id, {});
  }

  private handleSessionWorkspaceListFiles(id: JsonRpcId, _params: unknown): BridgeResponse {
    return this.result(id, { files: [] });
  }

  private handleSessionWorkspaceReadFile(id: JsonRpcId, _params: unknown): BridgeResponse {
    return this.result(id, { content: "" });
  }

  private handleSessionWorkspaceCreateFile(id: JsonRpcId, _params: unknown): BridgeResponse {
    return this.result(id, {});
  }

  private handleSessionFleetStart(id: JsonRpcId, _params: unknown): BridgeResponse {
    return this.result(id, { started: false });
  }

  // --- Core prompt / cancel (mapped from session.send & legacy methods) ------

  private async handlePrompt(id: JsonRpcId, params: unknown): Promise<BridgeResponse> {
    const parsed = assertSchema(CopilotPromptParamsSchema, params, "copilot prompt params");
    const localSessionId = parsed.sessionId ?? genId("sess");
    this.ensureSession(localSessionId);
    if (this.isSessionKilled(localSessionId)) {
      return this.error(id, -32000, "Session killed");
    }

    const promptText =
      typeof parsed.prompt === "string"
        ? parsed.prompt
        : JSON.stringify(parsed.context ?? []);

    this.addFrame(localSessionId, "copilot.prompt", redactPayload(parsed), true);

    if (!this.getLocalToAgentSession().has(localSessionId)) {
      const newSessionResult = (await this.requestAgent("session/new", {
        cwd: process.cwd(),
        mcpServers: [],
      })) as Record<string, unknown> | undefined;
      const agentSessionId =
        typeof newSessionResult?.sessionId === "string"
          ? newSessionResult.sessionId
          : localSessionId;
      this.setLocalToAgentSession(localSessionId, agentSessionId);
    }

    const agentSessionId = this.resolveAgentSessionId(localSessionId);
    const result = await this.requestAgent("session/prompt", {
      sessionId: agentSessionId,
      prompt: [{ type: "text", text: promptText }],
    });
    this.addFrame(localSessionId, "acp.session/prompt.result", redactPayload(result), true);

    const resultObj = typeof result === "object" && result ? (result as Record<string, unknown>) : {};
    if (resultObj.stopReason === "end_turn") {
      queueMicrotask(() => {
        this.ctx.sendToClient?.({
          jsonrpc: "2.0",
          method: "session.event",
          params: {
            sessionId: localSessionId,
            event: {
              id: `acp-idle-${Date.now()}`,
              timestamp: new Date().toISOString(),
              parentId: null,
              ephemeral: true,
              type: "session.idle",
              data: {},
            },
          },
        });
      });
    }

    return this.result(id, {
      sessionId: localSessionId,
      ...resultObj,
    });
  }

  private async handleCancel(id: JsonRpcId, params: unknown): Promise<BridgeResponse> {
    const rec = (params ?? {}) as Record<string, unknown>;
    const localSessionId = typeof rec.sessionId === "string" ? rec.sessionId : undefined;
    if (localSessionId) {
      try {
        const agentSessionId = this.resolveAgentSessionId(localSessionId);
        await this.requestAgent("session/cancel", { sessionId: agentSessionId });
      } catch {
        // Agent may not support session/cancel
      }
      this.updateSessionStatus(localSessionId, "completed");
    }
    return this.result(id, { ok: true });
  }
}
