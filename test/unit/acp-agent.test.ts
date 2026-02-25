import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PassThrough } from "node:stream";
import { BridgeAcpAgent } from "../../src/bridge/agents/acp.js";

/** Create stdin (capture what bridge writes) and stdout (push agent responses). */
function createTestStreams() {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stdinChunks: string[] = [];
  stdin.on("data", (chunk: Buffer | string) => {
    stdinChunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  });
  return {
    stdin,
    stdout,
    getStdinWritten: () => stdinChunks.join(""),
    pushAgentLine: (line: string) => {
      stdout.write(line + "\n");
    },
  };
}

function createAgent(
  streams: ReturnType<typeof createTestStreams>,
  options: { onNotification?: (method: string, params: unknown) => void; onRequest?: (method: string, id: string | number, params: unknown) => Promise<unknown> } = {}
) {
  return new BridgeAcpAgent("mock", [], {
    testStreams: { stdin: streams.stdin, stdout: streams.stdout },
    ...options,
  });
}

describe("BridgeAcpAgent", () => {
  let streams: ReturnType<typeof createTestStreams>;
  let agent: BridgeAcpAgent;

  afterEach(() => {
    agent?.close();
  });

  describe("request/response", () => {
    beforeEach(() => {
      streams = createTestStreams();
      agent = createAgent(streams);
    });

    it("sends JSON-RPC request and resolves with result when agent responds", async () => {
      const resultPromise = agent.request("initialize", { protocolVersion: 1 });
      // Simulate agent response (id 1 is first request)
      streams.pushAgentLine(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { ok: true } }));

      const result = await resultPromise;
      expect(result).toEqual({ ok: true });

      const written = streams.getStdinWritten();
      expect(JSON.parse(written.split("\n")[0])).toMatchObject({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: 1 },
      });
    });

    it("rejects with error when agent returns error object", async () => {
      const resultPromise = agent.request("ping", {});
      streams.pushAgentLine(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          error: { code: -32600, message: "Invalid request" },
        })
      );

      await expect(resultPromise).rejects.toThrow("Invalid request");
    });

    it("rejects on timeout when agent does not respond", async () => {
      const resultPromise = agent.request("slow", {}, 50);
      await expect(resultPromise).rejects.toThrow("ACP request timeout: slow");
    });
  });

  describe("notifications", () => {
    it("invokes onNotification when agent sends notification (no id)", async () => {
      streams = createTestStreams();
      const onNotification = vi.fn();
      agent = createAgent(streams, { onNotification });

      streams.pushAgentLine(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "session/update",
          params: { sessionId: "s-1", sessionUpdate: "end_turn" },
        })
      );

      await new Promise((r) => setImmediate(r));
      expect(onNotification).toHaveBeenCalledWith("session/update", {
        sessionId: "s-1",
        sessionUpdate: "end_turn",
      });
    });
  });

  describe("incoming requests (onRequest)", () => {
    it("calls onRequest and writes result back to stdin", async () => {
      streams = createTestStreams();
      const onRequest = vi.fn().mockResolvedValue({ outcome: "selected", optionId: "opt-1" });
      agent = createAgent(streams, { onRequest });

      streams.pushAgentLine(
        JSON.stringify({
          jsonrpc: "2.0",
          id: "agent-1",
          method: "session/request_permission",
          params: { sessionId: "s-1", toolCall: { toolCallId: "tc-1" } },
        })
      );

      await new Promise((r) => setImmediate(r));
      expect(onRequest).toHaveBeenCalledWith("session/request_permission", "agent-1", {
        sessionId: "s-1",
        toolCall: { toolCallId: "tc-1" },
      });

      await new Promise((r) => setImmediate(r));
      const written = streams.getStdinWritten();
      const responseLine = written.split("\n").find((l) => l.includes("agent-1"));
      expect(responseLine).toBeDefined();
      expect(JSON.parse(responseLine!)).toMatchObject({
        jsonrpc: "2.0",
        id: "agent-1",
        result: { outcome: "selected", optionId: "opt-1" },
      });
    });
  });

  describe("close", () => {
    it("rejects pending requests and kills process", async () => {
      streams = createTestStreams();
      agent = createAgent(streams);
      const resultPromise = agent.request("hang", {});
      agent.close();
      await expect(resultPromise).rejects.toThrow("ACP agent closed");
    });
  });
});
