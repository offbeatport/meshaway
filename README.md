# Meshaway

High-performance protocol bridge for agentic tools. Swap backends freely: ACP agents (Gemini CLI, OpenCode), OpenAI-compatible gateways (Ollama/vLLM/LiteLLM), or enterprise endpoints.

## Quick start

```bash
pnpm install
pnpm run build
npx meshaway
```

Then:
- **Hub UI**: http://127.0.0.1:7337
- **Bridge URL**: http://127.0.0.1:4321
- **Copilot SDK**: set `cliUrl = http://127.0.0.1:4321`

## Commands

| Command | Description |
|---------|-------------|
| `meshaway` | Start Hub + Bridge (default) |
| `meshaway hub` | Start Hub only |
| `meshaway bridge` | Start Bridge only |
| `meshaway bridge --transport stdio` | Bridge in stdio mode (for cliPath) |
| `meshaway bridge --no-hub` | Standalone bridge |
| `meshaway doctor` | Environment checks |
| `meshaway status` | Runtime status |

## Environment

- `MESH_BACKEND` — Backend specifier (`acp:gemini-cli`, `openai-compat:http://127.0.0.1:11434/v1`)
- `MESH_LISTEN` — Bridge listen address
- `MESH_HUB` — Hub URL (when bridge connects)
- `MESH_HUB_LISTEN` — Hub listen address

## Tech stack

- **CLI**: Commander, Chalk
- **Server**: Hono
- **Validation**: ArkType
- **Logging**: Pino
- **UI**: React, Base UI, Tailwind, Lucide React
- **Testing**: Vitest

## License

Apache-2.0
