#!/usr/bin/env node

/**
 * Example: Persisting and resuming sessions.
 *
 * Flow: createSession({ sessionId }), send prompt, destroy(), stop client,
 * then start again, resumeSession(sessionId), and send another prompt.
 * Useful when your app restarts or you want to reuse a conversation by id.
 *
 * Run: node examples/persisting_sessions.js
 * (Point cliPath to your meshaway binary or use pnpm exec meshaway.)
 */
import { CopilotClient } from "@github/copilot-sdk";

const SESSION_ID = "my-app-session-1";

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
    console.log("✅ Bridge started");

    // Create a session with a fixed id so we can resume it later
    const session = await client.createSession({ sessionId: SESSION_ID });
    console.log(`Session created with id: ${session.sessionId}`);

    session.on((e) => {
      if (e.type === "assistant.message_delta" && e.data?.deltaContent) {
        process.stdout.write(e.data.deltaContent);
      }
      if (e.type === "assistant.message" && e.data?.content) {
        process.stdout.write(e.data.content);
      }
    });

    console.log("\n--- First turn ---");
    await session.sendAndWait({ prompt: "Reply with: ok" }, 15_000);
    console.log("\n");

    await session.destroy();
    await client.stop();
    console.log("Session destroyed, client stopped.\n");

    // Start again and resume the same session
    await client.start();
    const resumed = await client.resumeSession(SESSION_ID);
    console.log(`Resumed session: ${resumed.sessionId}`);

    resumed.on((e) => {
      if (e.type === "assistant.message_delta" && e.data?.deltaContent) {
        process.stdout.write(e.data.deltaContent);
      }
      if (e.type === "assistant.message" && e.data?.content) {
        process.stdout.write(e.data.content);
      }
    });

    console.log("--- Second turn (resumed) ---");
    await resumed.sendAndWait({ prompt: "Reply with exactly: ok" }, 15_000);
    console.log("\n✅ Done");
  } catch (err) {
    console.error("❌ Failed:", err);
  } finally {
    await client.stop();
  }
}

main();
