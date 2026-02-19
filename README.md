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

## Documentation

| Doc | Description |
| ----- | ----------- |
| [docs/copilot.md](docs/copilot.md) | GitHub Copilot SDK integration |
| [docs/acp.md](docs/acp.md) | ACP agent backends |
| [docs/hub.md](docs/hub.md) | Hub API and UI |
| [docs/troubleshooting.md](docs/troubleshooting.md) | Common issues and fixes |

## Native binary

Build a single executable with the UI bundled:

```bash
pnpm run build:native
```

Output: `release/meshaway` (or `release/meshaway.exe` on Windows). The executable includes the Hub UI; no `dist/ui` directory is required at runtime.

**Note:** SEA (Single Executable Application) requires Node.js 25.5+. If unavailable, the script copies `release/meshaway.mjs`; run with `node release/meshaway.mjs`.

## Tech stack

- **CLI**: Commander, Chalk
- **Server**: Hono
- **Validation**: ArkType
- **Logging**: Pino
- **UI**: React, Base UI, Tailwind, Lucide React
- **Testing**: Vitest

## License

Apache-2.0
