# Meshaway

Protocol bridge that connects the [GitHub Copilot SDK](https://github.com/github/copilot-sdk) to [ACP](https://agentclientprotocol.com/) agents (Gemini CLI, OpenCode, etc.).

## What is this?

Meshaway sits between your app (using the Copilot SDK) and any [Agent Client Protocol](https://agentclientprotocol.com/) (ACP) agent. You talk to the SDK as usual; the bridge translates requests to ACP and streams responses back, so you can use Gemini, OpenCode, or other ACP agents without changing your integration. Optionally run **meshaway hub** to get a small web UI to inspect sessions and try prompts in a playground.

## Quick start

**1. Install** (macOS / Linux)

```bash
brew install meshaway
```

**2. Use with Copilot SDK**

```javascript
import { CopilotClient } from "@github/copilot-sdk";

const client = new CopilotClient({
  cliPath: "meshaway", // or path to binary, e.g. "./release/meshaway"
  cliArgs: [
    "bridge",
    "--agent",
    "gemini",
    "--agent-args",
    "--experimental-acp --model gemini-2.5-flash-lite",
  ],
});

await client.start();
const session = await client.createSession();
await session.send({ prompt: "Hello!" });
```

More in the [examples](https://github.com/offbeatport/meshaway/tree/main/examples) folder. Use any [ACP agent](https://agentclientprotocol.com/get-started/agents).

## Commands

| Command | Description |
|--------|-------------|
| `meshaway hub` | Start Hub (monitor sessions, playground) |
| `meshaway bridge --agent <name>` | Start Bridge in stdio mode for Copilot SDK |

## License

Apache-2.0
