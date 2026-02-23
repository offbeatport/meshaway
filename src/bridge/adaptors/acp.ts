/**
 * ACP client: when the client in front of the bridge speaks ACP, we forward
 * to the agent and return ACP responses (no conversion).
 */

import { genId } from "../../shared/ids.js";
import {
  AcpNewSessionParamsSchema,
  AcpPromptParamsSchema,
  AcpSessionCancelParamsSchema,
  AcpRequestPermissionParamsSchema,
} from "../../protocols/acp/types.js";
import { assertSchema } from "../../protocols/assert.js";
import { redactPayload } from "../interceptors/redaction.js";
import { BridgeAdapter } from "./base.js";
import type { BridgeResponse, JsonRpcId } from "./types.js";

const ACP_METHODS = [
  "session/new",
  "session/prompt",
  "session/cancel",
  "session/request_permission",
] as const;

export class AcpAdapter extends BridgeAdapter {
  supportedMethods(): readonly string[] {
    return ACP_METHODS;
  }

  async handle(id: JsonRpcId, method: string, params: unknown): Promise<BridgeResponse> {
    if (method === "session/new") {
      const valid = assertSchema(AcpNewSessionParamsSchema, params, "acp session/new params");
      const result = (await this.requestAgent("session/new", valid)) as Record<string, unknown>;
      const agentSessionId =
        typeof result?.sessionId === "string" ? result.sessionId : genId("sess");
      this.getLocalToAgentSession().set(agentSessionId, agentSessionId);
      this.ensureSession(agentSessionId);
      this.addFrame(agentSessionId, "acp.session/new", redactPayload(valid), true);
      return this.result(id, result);
    }

    if (method === "session/prompt") {
      const valid = assertSchema(AcpPromptParamsSchema, params, "acp session/prompt params");
      const localSessionId = valid.sessionId;
      if (this.isSessionKilled(localSessionId)) {
        return this.error(id, -32000, "Session killed");
      }
      this.ensureSession(localSessionId);
      const agentSessionId = this.resolveAgentSessionId(localSessionId);
      const payload = { ...valid, sessionId: agentSessionId };
      const result = await this.requestAgent("session/prompt", payload);
      this.addFrame(localSessionId, "acp.session/prompt", redactPayload(payload), true);
      this.addFrame(localSessionId, "acp.session/prompt.result", redactPayload(result), true);
      return this.result(id, result);
    }

    if (method === "session/cancel") {
      const valid = assertSchema(AcpSessionCancelParamsSchema, params, "acp session/cancel params");
      const agentSessionId = this.resolveAgentSessionId(valid.sessionId);
      const result = await this.requestAgent("session/cancel", {
        ...valid,
        sessionId: agentSessionId,
      });
      this.updateSessionStatus(valid.sessionId, "completed");
      this.addFrame(valid.sessionId, "acp.session/cancel", redactPayload(valid), true);
      return this.result(id, result);
    }

    if (method === "session/request_permission") {
      const valid = assertSchema(
        AcpRequestPermissionParamsSchema,
        params,
        "acp session/request_permission params"
      );
      const toolCall = valid.toolCall as Record<string, unknown>;
      const toolCallId =
        typeof toolCall.id === "string" ? toolCall.id : genId("toolcall");
      this.addFrame(valid.sessionId, "acp.session/request_permission", redactPayload(valid), true);
      const approved = true;
      return this.result(id, {
        decision: approved ? "approve" : "deny",
        approved,
        toolCallId,
      });
    }

    return this.error(id, -32601, `Method not implemented: ${method}`);
  }
}
