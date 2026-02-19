# Troubleshooting

## No backend configured

**Symptom:** Error or "not configured" for backend.

**Fix:**

```bash
# Local Ollama
meshaway --backend openai-compat:http://127.0.0.1:11434/v1

# ACP backend
meshaway --backend acp:gemini-cli

# Or set environment
export MESH_BACKEND=openai-compat:http://127.0.0.1:11434/v1
```

Run `meshaway doctor` for environment checks.

## Port in use (EADDRINUSE)

**Symptom:** `ERROR: Cannot listen on 127.0.0.1:4321 (EADDRINUSE)` or similar.

**Fix:** Choose a different port:

```bash
# Bridge on different port
meshaway --listen 127.0.0.1:4333

# Hub on different port
meshaway --hub-listen 127.0.0.1:7338
```

Or set `MESH_LISTEN` / `MESH_HUB_LISTEN`.

## UI not loading / assets missing

**Symptom:** Hub UI shows blank or unstyled page.

**Fix:**

1. Build the UI: `pnpm run build`
2. Restart Meshaway

For dev with hot reload: `pnpm run dev` (uses Vite dev server at port 5173).

## Unable to connect to 5173 (dev mode)

**Symptom:** "Unable to connect" when opening http://127.0.0.1:5173 during `pnpm run dev`.

**Fix:**

1. Check if port 5173 is in use: `lsof -i :5173`
2. Kill any process using the port
3. Ensure both Hub and Vite start — look for `[hub]` and `[vite]` prefixes in the output

## Ollama not reachable

**Symptom:** `meshaway doctor` reports Ollama not reachable.

**Fix:**

1. Start Ollama: `ollama serve` (or your system's Ollama service)
2. Verify: `curl http://127.0.0.1:11434/api/tags`
3. Use explicit backend: `meshaway --backend openai-compat:http://127.0.0.1:11434/v1`

## Bridge stdio mode — no output

**Symptom:** When using `cliPath` with stdio, nothing works.

**Fix:** In stdio mode, `stdout` is reserved for JSON-RPC. Ensure:

- No banners or logs go to stdout
- The client sends newline-delimited JSON-RPC on stdin
- Logs appear on stderr

## Doctor command

Run diagnostics:

```bash
meshaway doctor
```

Shows:

- Backend configuration
- Ollama reachability
- Suggested fixes

## Status command

Check runtime configuration:

```bash
meshaway status
```

Outputs JSON with version, backend, listen addresses, and hub URL.

## Environment reference

| Variable | Description |
| -------- | ----------- |
| `MESH_BACKEND` | Backend specifier (`acp:*`, `openai-compat:*`) |
| `MESH_LISTEN` | Bridge listen address |
| `MESH_HUB` | Hub URL (for bridge) |
| `MESH_HUB_LISTEN` | Hub listen address |

See `.env.example` in the project root for a template.

## See also

- [Copilot SDK integration](copilot.md)
- [ACP integration](acp.md)
- [Hub documentation](hub.md)
