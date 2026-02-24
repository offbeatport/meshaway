#!/usr/bin/env node

/**
 * Example: Working with multiple sessions.
 *
 * Matches the Copilot cookbook pattern:
 * https://github.com/github/awesome-copilot/blob/main/cookbook/copilot-sdk/nodejs/multiple-sessions.md
 *
 * Create multiple independent sessions, send prompts to each, follow up in one,
 * then destroy all and stop.
 *
 * Run: node examples/multiple_sessions.js
 * (Point cliPath to your meshaway binary or use pnpm exec meshaway.)
 */
import { CopilotClient } from "@github/copilot-sdk";

async function main() {
  const client = new CopilotClient({
    cliPath: "./release/meshaway",
    cliArgs: [
      "bridge",
      "--agent",
      "gemini",
      "--agent-args",
      "--experimental-acp --model gemini-2.5-flash",
    ],
    logLevel: "debug",
  });

  try {
    await client.start();
    console.log("✅ Bridge started\n");

    const session1 = await client.createSession({ sessionId: "python-help" });
    const session2 = await client.createSession({
      sessionId: "typescript-help",
    });

    console.log(`Session 1: ${session1.sessionId}`);
    console.log(`Session 2: ${session2.sessionId}\n`);

    const logStream = (label) => (e) => {
      if (e.type === "assistant.message_delta" && e.data?.deltaContent) {
        process.stdout.write(`[${label}] ${e.data.deltaContent}`);
      }
      if (e.type === "assistant.message" && e.data?.content) {
        process.stdout.write(`[${label}] ${e.data.content}`);
      }
    };

    session1.on(logStream("session1"));
    session2.on(logStream("session2"));

    console.log("--- First turn: set context per session ---\n");
    await session1.sendAndWait(
      {
        prompt:
          "You are helping with a Python project. Reply with: Python context set.",
      },
      15_000,
    );
    console.log("\n");
    await session2.sendAndWait(
      {
        prompt:
          "You are helping with a TypeScript project. Reply with: TypeScript context set.",
      },
      15_000,
    );
    console.log("\n");

    console.log("--- Follow-up in session 1 only ---\n");
    await session1.sendAndWait(
      { prompt: "How do I create a virtual environment? One short sentence." },
      15_000,
    );
    console.log("\n");

    console.log("--- Clean up ---\n");
    await session1.destroy();
    await session2.destroy();
    await client.stop();
    console.log("✅ Done");
  } catch (err) {
    console.error("❌ Failed:", err);
  } finally {
    await client.stop();
  }
}

main();
