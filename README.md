# Meshaway

Meshaway makes your AI agents transparent, auditable, and portable. Build on the SDK you love, run on the model you need, and watch it all in the client you prefer.

Local CLI bridge that normalizes GitHub/Claude-style streams into ACP, with an optional local Observer dashboard.

## Quick Start

```bash
npm install
npm run build
```

### Basic stdio bridge

In practice Meshaway sits between an SDK (on stdio) and a local ACP agent:

```text
GitHub Copilot / Claude Code (SDK)
        ⇅  stdio (clientType: github|claude)
      meshaway (bridge: translator + handlers)
        ⇅  stdio (ACP)
      local ACP agent (any backend: github/claude/gemini/llama/…)
```

- **Inbound**: SDK sends messages in its native protocol (GitHub JSON‑RPC or Claude stream).  
  Meshaway normalizes them and converts to ACP envelopes for your agent.
- **Agent**: your ACP agent talks to whatever backend you choose.
- **Outbound**: ACP responses are normalized and translated back into the same `clientType`
  protocol the SDK expects (GitHub or Claude).

Run the stdio bridge with a local agent:

```bash
meshaway --client-type auto --agent-command cat
```

### Observer UI mode

You can start the bridge together with the Observer dashboard:

```bash
meshaway serve --ui
```

The UI opens automatically in your browser on `localhost` (default port starts at `1618`) with a session token in the URL.

## Single Executable (Node.js SEA)

Build a standalone binary with [Node.js Single Executable Applications](https://nodejs.org/api/single-executable-applications.html):

```bash
npm install
npm run build:native
./release/meshaway start --mode auto --client-type auto --agent-command cat
```

- **Node 25.5+**: uses built-in `node --build-sea`.
- **Node 20.6–25.x**: uses `--experimental-sea-config` and [postject](https://github.com/nodejs/postject) (installed as a devDependency).

On Windows the output is `release/meshaway.exe`. On macOS the binary is ad-hoc signed so it can run locally.

For the Observer UI:

```bash
./release/meshaway ui --mode auto --client-type auto --agent-command cat
```
