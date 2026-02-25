/**
 * Shared agent configs for e2e tests (Copilot SDK → meshaway bridge → ACP agents).
 * Use getAgentConfigs(meshawayScript) to get cliArgs for each agent.
 */
export interface AgentConfig {
  name: string;
  cliArgs: string[];
}

export function getAgentConfigs(meshawayScript: string): AgentConfig[] {
  return [
    {
      name: "Gemini",
      cliArgs: [
        meshawayScript,
        "bridge",
        "--agent",
        "pnpm",
        "--agent-args",
        "exec gemini --experimental-acp --model gemini-2.5-flash",
      ],
    },
    {
      name: "OpenCode",
      cliArgs: [
        meshawayScript,
        "bridge",
        "--agent",
        "pnpm",
        "--agent-args",
        "exec opencode acp",
      ],
    },
  ];
}
