/**
 * E2E test: tool call flow. Uses a mock ACP agent that emits session/update
 * (tool_call start + completed) so we assert the Copilot client receives
 * tool.execution_start and tool.execution_complete events.
 * Requires: pnpm run build.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { CopilotClient } from "@github/copilot-sdk";

const projectRoot = process.cwd();
const meshawayScript = join(projectRoot, "dist/node/meshaway.mjs");
const mockAgentScript = join(projectRoot, "test/e2e/copilot/mock-acp-agent-tools.mjs");

describe("Tool call flow (mock ACP agent)", () => {
  it("receives tool.execution_start and tool.execution_complete from bridge", async () => {
    const client = new CopilotClient({
      cliPath: process.execPath,
      cliArgs: [
        meshawayScript,
        "bridge",
        "--agent",
        "node",
        "--agent-args",
        mockAgentScript,
      ],
    });

    const events: { type: string; data?: unknown }[] = [];
    try {
      await client.start();
      const session = await client.createSession();
      session.on((e) => events.push({ type: e.type, data: e.data }));
      await session.sendAndWait({ prompt: "Trigger tool" }, 10_000);

      const toolStart = events.some(
        (e) => e.type === "tool.execution_start" && (e.data as { toolCallId?: string })?.toolCallId === "tc-e2e-1"
      );
      const toolComplete = events.some(
        (e) =>
          e.type === "tool.execution_complete" &&
          (e.data as { toolCallId?: string })?.toolCallId === "tc-e2e-1"
      );

      expect(toolStart, "expected tool.execution_start").toBe(true);
      expect(toolComplete, "expected tool.execution_complete").toBe(true);
    } finally {
      await client.stop();
    }
  }, 15_000);
});
