import { join } from "node:path";

/**
 * Shared agent configs for e2e tests (Copilot SDK → meshaway bridge → ACP agents).
 * Use getAgentConfigs(meshawayScript) to get cliArgs for each agent.
 */
export interface AgentConfig {
  name: string;
  cliPath: string;
  cliArgs: string[];
}

const projectRoot = process.cwd();
const meshawayScript = join(projectRoot, "dist/node/meshaway.mjs");



export function getAgentConfigs(): AgentConfig[] {
  return [
    // {
    //   name: "Gemini",
    //   cliArgs: [
    //     meshawayScript,
    //     "bridge",
    //     "--agent",
    //     "pnpm",
    //     "--agent-args",
    //     "exec gemini --experimental-acp --model gemini-2.5-flash",
    //   ],
    // },
    {
      name: "OpenCode",
      cliPath: process.execPath,
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
