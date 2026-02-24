#!/usr/bin/env node

/**
 * Example: Session with systemMessage and model (recipe-style).
 *
 * Matches the pattern used in the Copilot cookbook, e.g. PR visualization:
 * https://github.com/github/awesome-copilot/blob/main/cookbook/copilot-sdk/nodejs/pr-visualization.md
 *
 * createSession({ model, systemMessage }) then sendAndWait. The bridge
 * accepts these options; the ACP agent receives the conversation without
 * separate system-message handling (for now).
 *
 * Run: node examples/session_with_system_message.js
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

    const session = await client.createSession({
      systemMessage: {
        content:
          "You are a helpful assistant. Reply briefly and in one short sentence.",
      },
    });
    console.log(`Session id: ${session.sessionId}\n`);

    session.on((e) => {
      if (e.type === "assistant.message_delta" && e.data?.deltaContent) {
        process.stdout.write(e.data.deltaContent);
      }
      if (e.type === "assistant.message" && e.data?.content) {
        process.stdout.write(e.data.content);
      }
    });

    console.log("Sending prompt...\n");
    await session.sendAndWait(
      { prompt: "What is 2 + 2? Reply with just the number." },
      15_000,
    );
    console.log("\n\n✅ Done");
  } catch (err) {
    console.error("❌ Failed:", err);
  } finally {
    await client.stop();
  }
}

main();
