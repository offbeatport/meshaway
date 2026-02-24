/**
 * E2E test: Copilot SDK → meshaway bridge → real ACP agents (Gemini, OpenCode).
 * Basic flow: start, create session, send prompt, receive events (same as examples/example_01.js).
 * Requires: pnpm run build, and devDependencies @google/gemini-cli, opencode-ai.
 */
import { describe, it, expect, afterAll } from "vitest";
import { CopilotClient } from "@github/copilot-sdk";
import { getAgentConfigs } from "./agent-configs.js";



async function assertSessionFlow(client: CopilotClient): Promise<void> {
  await client.start();
  const session = await client.createSession();
  const events: { type: string; data?: unknown }[] = [];
  session.on((e) => events.push({ type: e.type, data: e.data }));
  await session.sendAndWait({ prompt: "Reply with exactly: ok" }, 15_000);

  const hasMessageOrIdle =
    events.some(
      (e) => e.type === "assistant.message_delta" || e.type === "assistant.message"
    ) || events.some((e) => e.type === "session.idle");
  const contentStrings = events.flatMap((e) => {
    const d = e.data as { deltaContent?: string; content?: string } | undefined;
    return [d?.deltaContent, d?.content].filter(Boolean) as string[];
  });
  const hasOk = contentStrings.some((s) => s.includes("ok"));

  expect(events.length).toBeGreaterThan(0);
  expect(hasMessageOrIdle).toBe(true);
  expect(hasOk).toBe(true);
}

describe("Copilot SDK + meshaway bridge (basic flow)", () => {
  for (const { name, cliPath, cliArgs } of getAgentConfigs()) {
    describe(`with ${name}`, () => {
      const client = new CopilotClient({ cliPath, cliArgs });

      afterAll(() => client.stop());

      it("starts bridge, creates session, sends prompt and receives event", () =>
        assertSessionFlow(client),
        30_000);
    });
  }
});
