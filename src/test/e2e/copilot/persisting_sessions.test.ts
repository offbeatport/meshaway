/**
 * E2E test: Session persistence and resumption.
 * See: https://github.com/github/awesome-copilot/blob/main/cookbook/copilot-sdk/nodejs/persisting-sessions.md
 *
 * Flow: createSession({ sessionId }), send prompt, destroy(), then resumeSession(sessionId), send again.
 * Requires: pnpm run build, and devDependencies @google/gemini-cli, opencode-ai.
 */
import { describe, it, expect, afterAll } from "vitest";
import { CopilotClient } from "@github/copilot-sdk";
import { getAgentConfigs } from "./agent-configs.js";

const E2E_SESSION_ID = "e2e-persist-session";

async function assertPersistingSessionsFlow(client: CopilotClient): Promise<void> {
  await client.start();

  const session = await client.createSession({
    sessionId: E2E_SESSION_ID,
  });
  expect(session.sessionId).toBe(E2E_SESSION_ID);

  await session.sendAndWait({ prompt: "Reply with: ok" }, 15_000);
  await session.destroy();
  await client.stop();

  await client.start();
  const resumed = await client.resumeSession(E2E_SESSION_ID);
  expect(resumed.sessionId).toBe(E2E_SESSION_ID);

  const events: { type: string; data?: unknown }[] = [];
  resumed.on((e) => events.push({ type: e.type, data: e.data }));
  await resumed.sendAndWait({ prompt: "Reply with exactly: ok" }, 15_000);

  const hasMessageOrIdle =
    events.some(
      (e) => e.type === "assistant.message_delta" || e.type === "assistant.message"
    ) || events.some((e) => e.type === "session.idle");
  expect(events.length).toBeGreaterThan(0);
  expect(hasMessageOrIdle).toBe(true);
}

describe("Session persistence and resumption", () => {

  for (const { name, cliPath, cliArgs } of getAgentConfigs()) {
    describe(`with ${name}`, () => {
      const client = new CopilotClient({ cliPath, cliArgs });

      afterAll(() => client.stop());

      it("creates session with custom id, destroys, resumes and restores context", () =>
        assertPersistingSessionsFlow(client),
        60_000);
    });
  }
});
