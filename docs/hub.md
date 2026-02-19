# Hub

The Meshaway Hub is the control plane: a web UI and admin API for observability, governance, and routing.

## Quick start

```bash
npx meshaway
```

Open **http://127.0.0.1:7337** for the Hub UI.

## Hub UI

| Section      | Description                                      |
| ------------ | ------------------------------------------------ |
| **Home**     | Active sessions, pending approvals, quick connect |
| **Sessions** | List of sessions with status filter              |
| **Session detail** | Frames, tool calls, kill button             |
| **Approvals** | Pending tool-call approvals (approve/deny)      |
| **Routing**  | Backend routing rules                            |
| **Health**   | System status, Bridge URL, backend               |

## API endpoints

All API routes are under `/api` unless noted.

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | `/health` | Simple health check (`{ ok: true }`) |
| GET | `/api/health` | Extended health (hub, backend, bridgeUrl) |
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/:id` | Get session |
| GET | `/api/sessions/:id/frames` | Get session frames |
| POST | `/api/admin/kill/:id` | Kill session |
| POST | `/api/admin/approve/:id` | Resolve approval (body: `{ toolCallId, decision }`) |
| GET | `/api/approvals` | List pending approvals |
| GET | `/api/routing/rules` | Get routing rules |
| POST | `/api/routing/rules` | Set routing (body: `{ backend }`) |

## Running Hub only

Start the Hub without the Bridge:

```bash
meshaway hub
```

Use when you want the UI running before bridges connect, or when attaching a remote bridge.

Options:

- `--listen <host:port>` — Listen address (default: 127.0.0.1:7337)
- `--port <port>` — Port only

## Bridge connection

Bridges connect to the Hub to:

- Stream session frames
- Receive kill/approve commands
- Sync routing rules

The Bridge URL is configured via `--hub` or `MESH_HUB`:

```bash
meshaway bridge --hub http://127.0.0.1:7337
```

## Development

For UI development with hot reload:

1. Start the Hub (and optionally Bridge) in one terminal:

   ```bash
   npx meshaway
   ```

2. In another terminal, start the Vite dev server:

   ```bash
   pnpm run dev:ui
   ```

3. Open http://127.0.0.1:5173 for the UI with HMR. Configure the Vite proxy to point at the Hub (default: http://127.0.0.1:7337) if needed.

## See also

- [Copilot SDK integration](copilot.md)
- [ACP integration](acp.md)
- [Troubleshooting](troubleshooting.md)
