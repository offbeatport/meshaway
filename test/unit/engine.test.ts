import { describe, it, expect, vi, beforeEach } from "vitest";
import { BridgeEngine } from "../../src/bridge/engine.js";
import { BridgeAgent } from "../../src/bridge/agents/base.js";
import { BridgeAdapter } from "../../src/bridge/adaptors/base.js";
import type { AdapterContext } from "../../src/bridge/adaptors/context.js";
import type { BridgeResponse } from "../../src/bridge/adaptors/types.js";
import { VERSION } from "../../src/shared/constants.js";

class MockAgent extends BridgeAgent {
  request = vi.fn().mockResolvedValue({});
  close = vi.fn();
  constructor() {
    super("mock-agent", []);
  }
}

function createMockAdapter(overrides: {
  canHandle?: (method: string) => boolean;
  handle?: (id: string | number, method: string, params: unknown) => Promise<BridgeResponse>;
}): BridgeAdapter {
  const ctx = {
    agent: new MockAgent(),
    resolveAgentSessionId: (id: string) => id,
    ensureSession: () => {},
    addFrame: () => {},
    updateSessionStatus: () => {},
    getLocalToAgentSession: () => new Map<string, string>(),
    setLocalToAgentSession: () => {},
  } as unknown as AdapterContext;

  return new (class extends BridgeAdapter {
    supportedMethods = vi.fn().mockReturnValue(["session.create", "ping"]);
    canHandle = overrides.canHandle ?? ((method: string) => ["session.create", "ping"].includes(method));
    handle = overrides.handle ?? vi.fn().mockResolvedValue({ jsonrpc: "2.0" as const, id: 1, result: {} });
  })(ctx);
}

function createEngine(overrides: Partial<Parameters<typeof BridgeEngine>[0]> = {}) {
  const mockAgent = new MockAgent();
  const mockAdapter = createMockAdapter({});
  return new BridgeEngine({
    agent: "mock",
    adapter: "copilot",
    testAgent: mockAgent,
    testAdapter: mockAdapter,
    ...overrides,
  });
}

describe("BridgeEngine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("constructor", () => {
    it("throws when agent is missing and no testAgent", () => {
      expect(
        () =>
          new BridgeEngine({
            agent: "",
            adapter: "copilot",
          })
      ).toThrow("Agent command is required");
    });
  });

  describe("handleIncoming", () => {
    it("returns 400 and parse error for invalid body", async () => {
      const engine = createEngine();
      const result = await engine.handleIncoming(null);
      expect(result.status).toBe(400);
      expect(result.payload).toMatchObject({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32600, message: expect.any(String) },
      });
    });

    it("returns 204 for non-request (notification)", async () => {
      const engine = createEngine();
      const result = await engine.handleIncoming({
        jsonrpc: "2.0",
        id: 1,
        result: { ok: true },
      });
      expect(result.status).toBe(204);
      expect(result.payload).toBeUndefined();
    });

    it("returns 400 for missing request id", async () => {
      const engine = createEngine();
      // Omit id so envelope parses but reqId is null (request must have id)
      const result = await engine.handleIncoming({
        jsonrpc: "2.0",
        method: "ping",
      });
      expect(result.status).toBe(400);
      expect(result.payload).toMatchObject({
        error: { code: -32600, message: "Invalid request id" },
      });
    });

    it("handles initialize and returns serverInfo with VERSION", async () => {
      const engine = createEngine();
      const result = await engine.handleIncoming({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      });
      expect(result.status).toBe(200);
      expect(result.payload).toEqual({
        jsonrpc: "2.0",
        id: 1,
        result: {
          protocolVersion: 1,
          serverInfo: { name: "meshaway", version: VERSION },
        },
      });
    });

    it("returns method not implemented for unknown method", async () => {
      const engine = createEngine();
      const result = await engine.handleIncoming({
        jsonrpc: "2.0",
        id: 2,
        method: "unknown.method",
      });
      expect(result.status).toBe(200);
      expect(result.payload).toMatchObject({
        jsonrpc: "2.0",
        id: 2,
        error: { code: -32601, message: "Method not implemented: unknown.method" },
      });
    });

    it("delegates known method to adapter and returns response", async () => {
      const handle = vi.fn().mockResolvedValue({
        jsonrpc: "2.0" as const,
        id: 3,
        result: { sessionId: "sess-123" },
      });
      const mockAdapter = createMockAdapter({
        canHandle: (m) => m === "session.create",
        handle,
      });
      const engine = new BridgeEngine({
        agent: "mock",
        adapter: "copilot",
        testAgent: new MockAgent(),
        testAdapter: mockAdapter,
      });
      const result = await engine.handleIncoming({
        jsonrpc: "2.0",
        id: 3,
        method: "session.create",
        params: {},
      });
      expect(result.status).toBe(200);
      expect(result.payload).toEqual({ jsonrpc: "2.0", id: 3, result: { sessionId: "sess-123" } });
      expect(handle).toHaveBeenCalledWith(3, "session.create", {});
    });
  });

  describe("close", () => {
    it("calls agent close", () => {
      const mockAgent = new MockAgent();
      const engine = createEngine({ testAgent: mockAgent });
      engine.close();
      expect(mockAgent.close).toHaveBeenCalled();
    });
  });
});
