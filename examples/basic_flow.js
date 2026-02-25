#!/usr/bin/env node

import { CopilotClient } from "@github/copilot-sdk";

async function main() {
  const client = new CopilotClient({
    // POINT THIS TO YOUR MESHAWAY EXECUTABLE
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
    console.log("✅ Bridge Started Successfully");

    const session = await client.createSession();
    const prompt = "Write a 1-sentence poem about a bridge.";

    console.log(`Sending prompt: "${prompt}"`);

    session.on((event) => {
      switch (event.type) {
        case "assistant.message_delta":
          console.log(`Message Delta: ${event.data.deltaContent}`);
          break;
        case "tool.execution_start":
          console.log(`Tool: ${event.data.toolName}`);
          break;
        default:
          console.log(`Event: ${event.type} - ${JSON.stringify(event.data)}`);
          break;
      }
    });
    await session.send({ prompt });
  } catch (err) {
    console.error("❌ Failed:", err);
  } finally {
    await client.stop();
  }
}

main();
