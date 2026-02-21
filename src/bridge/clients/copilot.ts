/**
 * Copilot client (e.g. GitHub Copilot SDK): client sends Copilot protocol;
 * we convert to ACP → agent → convert ACP result back to Copilot.
 */

import { genId } from "../../shared/ids.js";
import { CopilotPromptParamsSchema } from "../../protocols/copilot/types.js";
import { assertSchema } from "../../protocols/assert.js";
import { redactPayload } from "../interceptors/redaction.js";
import { BridgeClient, type BridgeResponse, type JsonRpcId } from "./shared/index.js";

export class CopilotClient extends BridgeClient {
  supportedMethods(): readonly string[] {
    return ["prompt", "cancel"];
  }

  async handle(id: JsonRpcId, method: string, params: unknown): Promise<BridgeResponse> {
    if (method === "prompt") return this.handlePrompt(id, params);
    if (method === "cancel") return this.handleCancel(id, params);
    return this.error(id, -32601, `Method not implemented: ${method}`);
  }

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
      const newSessionResult = (await this.requestAcp("session/new", {
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
    const result = await this.requestAcp("session/prompt", {
      sessionId: agentSessionId,
      prompt: [{ type: "text", text: promptText }],
    });
    this.addFrame(localSessionId, "acp.session/prompt.result", redactPayload(result), true);

    return this.result(id, {
      sessionId: localSessionId,
      ...(typeof result === "object" && result ? (result as Record<string, unknown>) : { result }),
    });
  }

  private async handleCancel(id: JsonRpcId, params: unknown): Promise<BridgeResponse> {
    const rec = (params ?? {}) as Record<string, unknown>;
    const sessionId = typeof rec.sessionId === "string" ? rec.sessionId : undefined;
    if (sessionId) {
      this.updateSessionStatus(sessionId, "completed");
    }
    return this.result(id, { ok: true });
  }
}
