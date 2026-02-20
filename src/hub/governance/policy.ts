/** Basic routing policy. MVP: single agent. */
export interface RoutingRule {
  match?: string;
  agent: string;
}

let defaultAgent: string | undefined;

export function setDefaultAgent(agent: string): void {
  defaultAgent = agent;
}

export function getDefaultAgent(): string | undefined {
  return defaultAgent;
}
