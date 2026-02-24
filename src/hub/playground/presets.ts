/**
 * Playground runner presets: allowlisted (id → cliPath + cliArgs) so the server
 * never runs client-supplied commands. Shared so the client can display labels
 * and send only presetId.
 */
export type PlaygroundPresetId =
  | "copilot-stdio-gemini"
  | "copilot-stdio-codex"
  | "copilot-stdio-claude"
  | "copilot-stdio-opencode"
  | "copilot-stdio-qwen";

export interface PlaygroundPreset {
  id: PlaygroundPresetId;
  /** Left-hand label, e.g. "Github Copilot SDK". */
  from: string;
  /** Right-hand label, e.g. "Gemini". */
  to: string;
  cliPath: string;
  cliArgs: string[];
}

export const PLAYGROUND_PRESETS: PlaygroundPreset[] = [
  {
    id: "copilot-stdio-gemini",
    from: "Github Copilot SDK",
    to: "Gemini",
    cliPath: "meshaway",
    cliArgs: ["bridge", "--agent", "gemini", "--agent-args", "--experimental-acp --model gemini-2.5-flash-lite"],
  },
  {
    id: "copilot-stdio-claude",
    from: "Github Copilot SDK",
    to: "Claude Code ACP",
    cliPath: "meshaway",
    cliArgs: ["bridge", "--agent", "claude-code-acp"],
  },
  {
    id: "copilot-stdio-codex",
    from: "Github Copilot SDK",
    to: "OpenAI Codex",
    cliPath: "meshaway",
    cliArgs: ["bridge", "--agent", "codex-acp"],
  },
  {
    id: "copilot-stdio-opencode",
    from: "Github Copilot SDK",
    to: "OpenCode",
    cliPath: "meshaway",
    cliArgs: ["bridge", "--agent", "opencode", "--agent-args", "acp"],
  }
];

const PRESETS_BY_ID = new Map(PLAYGROUND_PRESETS.map((p) => [p.id, p]));

export function getPlaygroundPreset(id: string): PlaygroundPreset | undefined {
  return PRESETS_BY_ID.get(id as PlaygroundPresetId);
}

export const DEFAULT_PLAYGROUND_PRESET_ID: PlaygroundPresetId = "copilot-stdio-gemini";
