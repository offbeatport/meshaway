/**
 * E2E test: Multiple independent sessions.
 * See: https://github.com/github/awesome-copilot/blob/main/cookbook/copilot-sdk/nodejs/multiple-sessions.md
 *
 * Create multiple sessions, send prompts to each, assert each gets its own response,
 * then destroy all and stop.
 * Requires: pnpm run build, and devDependencies @google/gemini-cli, opencode-ai.
 */
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { CopilotClient } from "@github/copilot-sdk";
import { getAgentConfigs } from "./agent-configs.js";

const projectRoot = process.cwd();
const meshawayScript = join(projectRoot, "dist/node/meshaway.mjs");

function collectContent(events: { type: string; data?: unknown }[]): string {
  return events
    .flatMap((e) => {
      const d = e.data as { deltaContent?: string; content?: string } | undefined;
      return [d?.deltaContent, d?.content].filter(Boolean) as string[];
    })
    .join("");
}

async function assertMultipleSessionsFlow(client: CopilotClient): Promise<void> {
  await client.start();

  const session1 = await client.createSession({ sessionId: "multi-sess-1" });
  const session2 = await client.createSession({ sessionId: "multi-sess-2" });

  expect(session1.sessionId).toBe("multi-sess-1");
  expect(session2.sessionId).toBe("multi-sess-2");

  const events1: { type: string; data?: unknown }[] = [];
  const events2: { type: string; data?: unknown }[] = [];
  session1.on((e) => events1.push({ type: e.type, data: e.data }));
  session2.on((e) => events2.push({ type: e.type, data: e.data }));

  await session1.sendAndWait({ prompt: "Reply with only the word: one" }, 15_000);
  await session2.sendAndWait({ prompt: "Reply with only the word: two" }, 15_000);

  const hasMessageOrIdle = (evs: { type: string }[]) =>
    evs.some(
      (e) =>
        e.type === "assistant.message_delta" ||
        e.type === "assistant.message" ||
        e.type === "session.idle"
    );

  expect(events1.length).toBeGreaterThan(0);
  expect(events2.length).toBeGreaterThan(0);
  expect(hasMessageOrIdle(events1)).toBe(true);
  expect(hasMessageOrIdle(events2)).toBe(true);

  const content1 = collectContent(events1);
  const content2 = collectContent(events2);
  expect(content1.toLowerCase()).toContain("one");
  expect(content2.toLowerCase()).toContain("two");

  await session1.destroy();
  await session2.destroy();
  await client.stop();
}

describe("Multiple sessions", () => {
  if (!existsSync(meshawayScript)) {
    it.skip("requires build (pnpm run build)", () => {});
    return;
  }

  for (const { name, cliArgs } of getAgentConfigs(meshawayScript)) {
    it.concurrent(`with ${name}: create two sessions, send to each, destroy both`, async () => {
      const client = new CopilotClient({
        cliPath: process.execPath,
        cliArgs,
        logLevel: "error",
      });
      try {
        await assertMultipleSessionsFlow(client);
      } finally {
        await client.stop();
      }
    }, 45_000);
  }
});
