# Meshaway Documentation

## Overview

Meshaway is a protocol bridge for agentic tools. It routes Copilot SDK and ACP clients to backends (Ollama, Gemini CLI, etc.) and provides a Hub for observability and governance.

## Documentation

| Document | Description |
| -------- | ----------- |
| [copilot.md](copilot.md) | Connect GitHub Copilot SDK via `cliUrl` or `cliPath` |
| [acp.md](acp.md) | Use ACP agents (Gemini CLI, OpenCode) as backends |
| [hub.md](hub.md) | Hub web UI, API endpoints, and development |
| [troubleshooting.md](troubleshooting.md) | Common issues, `meshaway doctor`, environment variables |

## Quick links

- **Hub UI**: http://127.0.0.1:7337
- **Bridge URL**: http://127.0.0.1:4321
- **Copilot SDK**: `cliUrl = http://127.0.0.1:4321`
