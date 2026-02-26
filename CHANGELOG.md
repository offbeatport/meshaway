# @offbeatport/meshaway

## 0.1.2

### Patch Changes

- Meshaway Hub UI fix version, messages and light theme

## 0.1.2

### Patch Changes

- **Hub UI**
  - Light theme: Fixed colors; lighter sidebar hover; Playground code and console sections use light backgrounds and improved contrast; borders made more prominent (darker).
  - Shared empty-sessions state on Home and Sessions list; homepage quick connect replaced with Examples and Repository links.
  - App version shown in sidebar (above border, right-aligned).

## 0.1.1

### Patch Changes

- Minor bug fixes
  - **CLI:** Fix default logging to `plain`
  - **Bridge:** Use shared `VERSION` constant in engine instead of hardcoded version.
  - **Shared:** Remove broken `env.js` export from barrel (file did not exist).
  - **Typecheck:** Exclude Hub UI from root `tsconfig` so `pnpm run typecheck` passes; mark optional SQLite session store with `@ts-nocheck` (in-memory remains default).
  - **Hub Playground:** Accept `cancel` as an alias for `reset` in the control API.
  - **Hub Playground:** Remove non-existent `copilot-stdio-qwen` preset from `PlaygroundPresetId` type.

## 0.1.0

### Minor Changes

- **Initial release.** Meshaway is a protocol bridge that connects the [GitHub Copilot SDK](https://github.com/github/copilot-sdk) to [ACP](https://agentclientprotocol.com/) agents (e.g. Gemini CLI, OpenCode).
  - **Bridge** — Run `meshaway bridge --agent <name>` for stdio mode; the Copilot SDK talks to the bridge, which translates to ACP and streams responses. Works with any ACP agent on your PATH.
  - **Hub** — Run `meshaway hub` to start a local web UI: monitor sessions, inspect prompts and responses, and use the Playground to try prompts against your configured agent. Optional `--hub-url` / `MESHAWAY_HUB_URL` lets the bridge sync activity to the Hub for visibility.
  - **Install** — `brew install meshaway` (macOS/Linux), `npm install -g @offbeatport/meshaway`, or download standalone binaries from [GitHub Releases](https://github.com/offbeatport/meshaway/releases). Node.js 20+ required for the npm build; standalone binaries are Node-free.

  Requires an ACP agent (e.g. `gemini`, `opencode`) and any API keys or auth that agent needs. Sessions are in-memory only; persistence is planned for a future release.
