const killedSessions = new Set<string>();

export function markKilled(sessionId: string): void {
  killedSessions.add(sessionId);
}

export function isKilled(sessionId: string): boolean {
  return killedSessions.has(sessionId);
}

export function clearKilled(sessionId: string): void {
  killedSessions.delete(sessionId);
}
