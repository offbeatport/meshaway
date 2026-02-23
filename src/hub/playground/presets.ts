/**
 * Playground runner presets: allowlisted (id → cliPath + cliArgs) so the server
 * never runs client-supplied commands. Shared so the client can display labels
 * and send only presetId.
 */
export type PlaygroundPresetId =
  | "copilot-stdio-gemini"
  | "copilot-stdio-claude"
  | "copilot-stdio-opencode";

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
    cliArgs: ["bridge", "--agent", "gemini", "--agent-args", "--experimental-acp"],
  },
  {
    id: "copilot-stdio-claude",
    from: "Github Copilot SDK",
    to: "Claude Code",
    cliPath: "meshaway",
    cliArgs: ["bridge", "--agent", "claude"],
  },
  {
    id: "copilot-stdio-opencode",
    from: "Github Copilot SDK",
    to: "OpenCode",
    cliPath: "meshaway",
    cliArgs: ["bridge", "--agent", "opencode"],
  },
];

const PRESETS_BY_ID = new Map(PLAYGROUND_PRESETS.map((p) => [p.id, p]));

export function getPlaygroundPreset(id: string): PlaygroundPreset | undefined {
  return PRESETS_BY_ID.get(id as PlaygroundPresetId);
}

export const DEFAULT_PLAYGROUND_PRESET_ID: PlaygroundPresetId = "copilot-stdio-gemini";
