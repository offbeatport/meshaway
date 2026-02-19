# GitHub Copilot SDK Integration

Meshaway acts as a protocol bridge for the [GitHub Copilot SDK](https://github.com/github/copilot-sdk). Point your Copilot client at the Bridge URL and Meshaway routes requests to your chosen backend (Ollama, ACP agents, etc.).

## Quick start

1. Start Meshaway:

   ```bash
   npx meshaway
   ```

2. Configure Copilot SDK to connect via URL:

   ```javascript
   cliUrl = "http://127.0.0.1:4321"
   ```

3. Start a task — sessions appear in the Hub UI at http://127.0.0.1:7337.

## Connection modes

### URL mode (recommended)

Set `cliUrl` to the Bridge URL. Copilot connects over HTTP.

| Setting   | Value                      |
| --------- | -------------------------- |
| `cliUrl`  | `http://127.0.0.1:4321`    |

### stdio mode (subprocess)

If your client only supports spawning a subprocess, use the Bridge in stdio mode:

```bash
meshaway bridge --transport stdio --hub http://127.0.0.1:7337
```

Then set `cliPath` to the Meshaway binary (or `npx meshaway bridge --transport stdio --hub http://127.0.0.1:7337`).

**Note:** In stdio mode, `stdout` is reserved for JSON-RPC. Logs go to `stderr`.

## Backend selection

Meshaway autodetects Ollama at `http://127.0.0.1:11434`. To use a different backend:

```bash
# OpenAI-compatible HTTP (Ollama, vLLM, LiteLLM)
npx meshaway --backend openai-compat:http://127.0.0.1:11434/v1

# ACP agent (Gemini CLI, OpenCode)
npx meshaway --backend acp:gemini-cli
```

Or set `MESH_BACKEND`:

```bash
export MESH_BACKEND=openai-compat:http://127.0.0.1:11434/v1
npx meshaway
```

## Supported features

- Session lifecycle
- Streaming responses
- Tool calls and tool results
- Cancellation
- Session frames (observability via Hub)

## Hub integration

When the Bridge connects to the Hub, you get:

- **Sessions list** — See active and recent sessions
- **Session detail** — Inspect frames, tool calls, raw JSON
- **Kill switch** — Terminate runaway sessions
- **Approvals** — Approve or deny dangerous tool calls (when configured)

## See also

- [Hub documentation](hub.md) — API and UI
- [ACP integration](acp.md) — ACP agents as backends
- [Troubleshooting](troubleshooting.md) — Common issues
