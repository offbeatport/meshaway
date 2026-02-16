# Meshaway

Local CLI bridge that normalizes GitHub/Claude-style streams into ACP, with an optional local Observer dashboard.

## Quick Start

```bash
npm install
npm run build
```

Run bridge mode:

```bash
mesh start --mode auto --client-type auto --agent-command cat
```

Run Observer UI mode:

```bash
mesh ui --mode auto --client-type auto --agent-command cat
```

The UI opens automatically in your browser on `localhost` (default port starts at `1618`) with a session token in the URL.

## Native Binary (macOS arm64)

```bash
npm install
npm run build:native
./release/mesh start --mode auto --client-type auto --agent-command cat
```

For the dashboard:

```bash
./release/mesh ui --mode auto --client-type auto --agent-command cat
```
