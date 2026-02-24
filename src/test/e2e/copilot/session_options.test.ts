
import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { CopilotClient } from "@github/copilot-sdk";
import { getAgentConfigs } from "./agent-configs.js";

const projectRoot = process.cwd();
const meshawayScript = join(projectRoot, "dist/node/meshaway.mjs");

async function assertSessionWithOptions(client: CopilotClient): Promise<void> {
  await client.start();

  const session = await client.createSession({
    model: "gpt-4",
    systemMessage: {
      content: "You are a helpful assistant. Reply briefly.",
    },
  });
  expect(session.sessionId).toBeDefined();

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

describe("Session with systemMessage and model (recipe-style options)", () => {
  if (!existsSync(meshawayScript)) {
    it.skip("requires build (pnpm run build)", () => { });
    return;
  }

  for (const { name, cliArgs } of getAgentConfigs(meshawayScript)) {
    it.concurrent(`with ${name}: createSession(model, systemMessage) then send prompt`, async () => {
      const client = new CopilotClient({
        cliPath: process.execPath,
        cliArgs,
        logLevel: "error",
      });
      try {
        await assertSessionWithOptions(client);
      } finally {
        await client.stop();
      }
    }, 20_000);
  }
});
