# Meshaway

Meshaway makes your AI agents transparent, auditable, and portable. Build on the SDK you love, run on the model you need, and watch it all in the client you prefer.

Local CLI bridge that normalizes GitHub/Claude-style streams into ACP, with an optional local Observer dashboard.

## Quick Start

```bash
npm install
npm run build
```

Run bridge mode:

```bash
meshaway start --mode auto --client-type auto --agent-command cat
```

Run Observer UI mode:

```bash
meshaway ui --mode auto --client-type auto --agent-command cat
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
