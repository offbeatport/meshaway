# Meshaway

Protocol bridge that connects the [GitHub Copilot SDK](https://github.com/github/copilot-sdk) to [ACP](https://agentclientprotocol.com/) agents (Gemini CLI, OpenCode, etc.).

## What is this?

Meshaway sits between your app (using the Copilot SDK) and any [Agent Client Protocol](https://agentclientprotocol.com/) (ACP) agent. You talk to the SDK as usual; the bridge translates requests to ACP and streams responses back, so you can use Gemini, OpenCode, or other ACP agents without changing your integration. Optionally run **meshaway hub** to get a small web UI to inspect sessions and try prompts in a playground.

## Requirements

- **Node.js** 20+ (for the bridge and Hub).
- An **ACP agent** on your PATH or via your runtime (e.g. `gemini`, `opencode`). See the [list of ACP agents](https://agentclientprotocol.com/get-started/agents).
- Some agents need **API keys or auth** (e.g. Gemini); set them as you would when running the agent directly.

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

**Build from source** (no brew): `pnpm install && pnpm run build`. From the repo run `pnpm exec meshaway hub` or `pnpm exec meshaway bridge --agent gemini`. For the Copilot SDK use `cliPath: "pnpm", cliArgs: ["exec", "meshaway", "bridge", "--agent", "gemini", ...]` when in the project directory, or `cliPath: "node", cliArgs: ["dist/node/meshaway.mjs", "bridge", ...]` with an absolute path to `dist/node/meshaway.mjs`.

## Sessions and the Hub

**On the bridge** sessions are kept **in memory** only: the bridge tracks session ids (SDK session ↔ agent session) and **frames** (e.g. prompts, ACP session/update events). Nothing is written to disk, so when the bridge process exits, that state is gone.

If you point the bridge at a **Hub** (`--hub-url <url>` or `MESHAWAY_HUB_URL`), the bridge **syncs activity to the hub**: it reports session start, each frame (prompt, assistant update, etc.), and session end. The hub stores that replica so you can open the Hub UI and see sessions and their frames. When you use the **Playground** in the Hub, it starts a bridge with `MESHAWAY_HUB_URL` and `MESHAWAY_RUNNER_SESSION_ID` so all frames for that run show up under one “runner” session in the UI.

## Commands

| Command | Description |
|--------|-------------|
| `meshaway hub` | Start Hub (monitor sessions, playground) |
| `meshaway bridge --agent <name>` | Start Bridge in stdio mode for Copilot SDK |

**Bridge options:** `--agent <cmd>`, `--agent-args "<space-separated flags>"`, `--hub-url <url>`, `--log-level <level>`.

## Environment variables

| Variable | Used by | Purpose |
|----------|--------|---------|
| `MESHAWAY_HUB_URL` | Bridge | Send session/frame updates to this Hub URL (same as `--hub-url`). |
| `MESHAWAY_RUNNER_SESSION_ID` | Bridge (when run from Hub Playground) | Report all frames under this session id so the Playground UI shows them. |

## Limitations

- **No persistence:** Sessions and conversation history exist only in memory. After the bridge (or agent) restarts, context is gone; `resumeSession` reuses the session id but the agent starts with a new context.
- **Agent limits:** Quota and errors (e.g. “daily quota exceeded”) come from the agent or its API; the bridge only forwards them.

## License

Apache-2.0
