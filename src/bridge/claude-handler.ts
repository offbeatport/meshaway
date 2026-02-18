/**
 * Claude Agent SDK protocol handler.
 * The SDK expects the first message from the agent to be a system init with session_id;
 * we send that once, then stream events as usual (handled by the translator).
 */

export interface IClaudeHandlerEngine {
  writeClientMessage(message: unknown): void;
  claudeInitSent: boolean;
  setClaudeInitSent(v: boolean): void;
}

export function createClaudeHandler(engine: IClaudeHandlerEngine) {
  const ctx = engine;

  function ensureInit(): void {
    if (ctx.claudeInitSent) return;
    const sessionId = `claude_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    ctx.writeClientMessage({
      type: "system",
      subtype: "init",
      session_id: sessionId,
    });
    ctx.setClaudeInitSent(true);
  }

  return {
    tryHandle(_parsed: unknown): boolean {
      return false;
    },
    ensureInit,
  };
}

export type ClaudeHandler = ReturnType<typeof createClaudeHandler>;
