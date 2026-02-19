# ACP Integration

Meshaway supports [ACP (Agent Communication Protocol)](https://spec.modelcontextprotocol.io/) agents as backends. Use ACP agents like Gemini CLI or OpenCode with Copilot SDK and other clients.

## Backend specifier

Use the `acp:` prefix for ACP backends:

```bash
# Gemini CLI
npx meshaway --backend acp:gemini-cli

# OpenCode
npx meshaway --backend acp:opencode
```

Or via environment:

```bash
export MESH_BACKEND=acp:gemini-cli
npx meshaway
```

## Connection patterns

### A) URL-based (preferred)

If the client can connect to an ACP server URL, point it at the Meshaway Bridge:

```
http://127.0.0.1:4321
```

The Bridge translates between Copilot JSON-RPC and ACP JSON-RPC.

### B) Subprocess stdio

If the client only supports spawning a subprocess over stdio:

```bash
meshaway bridge --transport stdio --hub http://127.0.0.1:7337
```

Configure the client to spawn this command. `stdin` receives JSON-RPC, `stdout` sends JSON-RPC. Logs go to `stderr`.

## Protocol translation

Meshaway translates:

- Session create/update
- Streaming deltas
- Tool calls and results
- Cancellations

IDs, ordering, backpressure, and error semantics are preserved.

## ACP stdio adapter

The ACP adapter spawns the agent as a subprocess and communicates via newline-delimited JSON over stdin/stdout. The agent command is derived from the backend specifier (e.g. `gemini-cli` for `acp:gemini-cli`).

## See also

- [Copilot SDK integration](copilot.md) — Connecting Copilot to Meshaway
- [Hub documentation](hub.md) — Observability and governance
- [Troubleshooting](troubleshooting.md) — Common issues
