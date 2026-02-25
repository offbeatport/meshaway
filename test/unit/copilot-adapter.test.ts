import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CopilotAdapter } from "../../src/bridge/adaptors/copilot.js";
import type { AdapterContext } from "../../src/bridge/adaptors/context.js";
import { BridgeAgent } from "../../src/bridge/agents/base.js";
import { VERSION } from "../../src/shared/constants.js";
import { markKilled, clearKilled } from "../../src/bridge/interceptors/killswitch.js";

class MockAgent extends BridgeAgent {
  request = vi.fn();
  close = vi.fn();
  constructor() {
    super("mock", []);
  }
}

function createContext(overrides: Partial<AdapterContext> = {}): AdapterContext {
  const agent = new MockAgent();
  const localToAgent = new Map<string, string>();
  const ensureSession = vi.fn();
  const addFrame = vi.fn();
  const updateSessionStatus = vi.fn();

  return {
    agent,
    resolveAgentSessionId: (id: string) => localToAgent.get(id) ?? id,
    ensureSession,
    addFrame,
    updateSessionStatus,
    getLocalToAgentSession: () => localToAgent,
    setLocalToAgentSession: (localId: string, agentId: string) => localToAgent.set(localId, agentId),
    sendToClient: vi.fn(),
    ...overrides,
  };
}

describe("CopilotAdapter", () => {
  let ctx: AdapterContext;
  let mockAgent: MockAgent;

  beforeEach(() => {
    mockAgent = new MockAgent();
    ctx = createContext({ agent: mockAgent });
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearKilled("killed-sess");
  });

  describe("supportedMethods / canHandle", () => {
    it("includes ping, session.create, session.send, status.get, etc.", () => {
      const adapter = new CopilotAdapter(ctx);
      const methods = adapter.supportedMethods();
      expect(methods).toContain("ping");
      expect(methods).toContain("status.get");
      expect(methods).toContain("session.create");
      expect(methods).toContain("session.send");
      expect(methods).toContain("prompt");
    });

    it("canHandle returns true for supported methods", () => {
      const adapter = new CopilotAdapter(ctx);
      expect(adapter.canHandle("ping")).toBe(true);
      expect(adapter.canHandle("session.create")).toBe(true);
      expect(adapter.canHandle("unknown.method")).toBe(false);
    });
  });

  describe("handle", () => {
    it("returns method not implemented for unknown method", async () => {
      const adapter = new CopilotAdapter(ctx);
      const res = await adapter.handle(1, "unknown.method", {});
      expect(res).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32601, message: "Method not implemented: unknown.method" },
      });
    });

    it("status.get returns version and protocolVersion", async () => {
      const adapter = new CopilotAdapter(ctx);
      const res = await adapter.handle(2, "status.get");
      expect(res).toEqual({
        jsonrpc: "2.0",
        id: 2,
        result: { version: VERSION, protocolVersion: 2 },
      });
    });

    it("tools.list returns empty tools", async () => {
      const adapter = new CopilotAdapter(ctx);
      const res = await adapter.handle(3, "tools.list");
      expect(res).toMatchObject({ jsonrpc: "2.0", id: 3, result: { tools: [] } });
    });

    it("account.getQuota returns quotaSnapshots", async () => {
      const adapter = new CopilotAdapter(ctx);
      const res = await adapter.handle(4, "account.getQuota");
      expect(res).toMatchObject({ result: { quotaSnapshots: {} } });
    });

    it("session.model.getCurrent returns modelId undefined", async () => {
      const adapter = new CopilotAdapter(ctx);
      const res = await adapter.handle(5, "session.model.getCurrent", { sessionId: "s-1" });
      expect(res).toMatchObject({ result: { modelId: undefined } });
    });

    it("session.mode.get returns interactive", async () => {
      const adapter = new CopilotAdapter(ctx);
      const res = await adapter.handle(6, "session.mode.get", {});
      expect(res).toMatchObject({ result: { mode: "interactive" } });
    });

    it("session.destroy calls updateSessionStatus and returns ok", async () => {
      const adapter = new CopilotAdapter(ctx);
      ctx.ensureSession("s-destroy");
      const res = await adapter.handle(7, "session.destroy", { sessionId: "s-destroy" });
      expect(res).toMatchObject({ result: { ok: true } });
      expect(ctx.updateSessionStatus).toHaveBeenCalledWith("s-destroy", "completed");
    });

    it("session.create ensures session and calls agent session/new when no mapping", async () => {
      mockAgent.request.mockResolvedValue({ sessionId: "agent-sess-1" });
      const adapter = new CopilotAdapter(ctx);
      const res = await adapter.handle(8, "session.create", {});
      expect(ctx.ensureSession).toHaveBeenCalled();
      expect(mockAgent.request).toHaveBeenCalledWith(
        "session/new",
        expect.objectContaining({ cwd: expect.any(String), mcpServers: [] })
      );
      expect(ctx.getLocalToAgentSession().size).toBeGreaterThan(0);
      expect(res).toMatchObject({
        jsonrpc: "2.0",
        id: 8,
        result: expect.objectContaining({ workspacePath: null }),
      });
    });

    it("session.create with sessionId uses it and still calls session/new", async () => {
      mockAgent.request.mockResolvedValue({ sessionId: "agent-2" });
      const adapter = new CopilotAdapter(ctx);
      const res = await adapter.handle(9, "session.create", { sessionId: "my-sess" });
      expect(ctx.ensureSession).toHaveBeenCalledWith("my-sess");
      expect(res).toMatchObject({ result: { sessionId: "my-sess", workspacePath: null } });
      expect(ctx.getLocalToAgentSession().get("my-sess")).toBe("agent-2");
    });

    it("handlePrompt returns Session killed when session is marked killed", async () => {
      markKilled("killed-sess");
      const adapter = new CopilotAdapter(ctx);
      const res = await adapter.handle(10, "prompt", {
        sessionId: "killed-sess",
        prompt: "hello",
      });
      expect(res).toMatchObject({
        error: { code: -32000, message: "Session killed" },
      });
      expect(mockAgent.request).not.toHaveBeenCalled();
    });

    it("handlePrompt calls session/new then session/prompt and returns result", async () => {
      mockAgent.request
        .mockResolvedValueOnce({ sessionId: "agent-prompt-1" })
        .mockResolvedValueOnce({ stopReason: "end_turn", messageId: "msg-1" });
      const adapter = new CopilotAdapter(ctx);
      const res = await adapter.handle(11, "prompt", {
        sessionId: "prompt-sess",
        prompt: "Say hi",
      });
      expect(ctx.ensureSession).toHaveBeenCalledWith("prompt-sess");
      expect(mockAgent.request).toHaveBeenNthCalledWith(1, "session/new", expect.any(Object));
      expect(mockAgent.request).toHaveBeenNthCalledWith(2, "session/prompt", {
        sessionId: "agent-prompt-1",
        prompt: [{ type: "text", text: "Say hi" }],
      });
      expect(res).toMatchObject({
        result: expect.objectContaining({
          sessionId: "prompt-sess",
          stopReason: "end_turn",
          messageId: "msg-1",
        }),
      });
      expect(ctx.addFrame).toHaveBeenCalledWith("prompt-sess", "copilot.prompt", expect.any(Object), true);
    });

    it("ping calls agent initialize and returns message and protocolVersion", async () => {
      mockAgent.request.mockResolvedValue(undefined);
      const adapter = new CopilotAdapter(ctx);
      const res = await adapter.handle(12, "ping", { message: "hello" });
      expect(mockAgent.request).toHaveBeenCalledWith("initialize", {
        protocolVersion: 1,
        clientCapabilities: {},
        clientInfo: { name: "meshaway-copilot-bridge", version: VERSION },
      });
      expect(res).toMatchObject({
        result: expect.objectContaining({
          message: "hello",
          protocolVersion: 2,
          timestamp: expect.any(Number),
        }),
      });
    });
  });
});
