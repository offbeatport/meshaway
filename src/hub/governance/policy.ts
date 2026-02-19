/** Basic routing policy. MVP: single backend. */
export interface RoutingRule {
  match?: string;
  backend: string;
}

let defaultBackend: string | undefined;

export function setDefaultBackend(backend: string): void {
  defaultBackend = backend;
}

export function getDefaultBackend(): string | undefined {
  return defaultBackend;
}
