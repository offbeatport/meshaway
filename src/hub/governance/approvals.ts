/** Simple approval tracking for dangerous tools. */
const pendingApprovals = new Map<
  string,
  { resolve: (decision: boolean) => void; sessionId: string; toolCallId: string; command?: string; createdAt: number }
>();

export function listPendingApprovals(): Array<{ key: string; sessionId: string; toolCallId: string; command?: string }> {
  return Array.from(pendingApprovals.entries()).map(([key, v]) => ({
    key,
    sessionId: v.sessionId,
    toolCallId: v.toolCallId,
    command: v.command,
  }));
}

export function requestApproval(
  sessionId: string,
  toolCallId: string,
  meta?: { command?: string }
): Promise<boolean> {
  const key = `${sessionId}:${toolCallId}`;
  return new Promise((resolve) => {
    pendingApprovals.set(key, {
      resolve,
      sessionId,
      toolCallId,
      command: meta?.command,
      createdAt: Date.now(),
    });
  });
}

export function resolveApproval(sessionId: string, toolCallId: string, approved: boolean): boolean {
  const key = `${sessionId}:${toolCallId}`;
  const pending = pendingApprovals.get(key);
  if (!pending) return false;
  pendingApprovals.delete(key);
  pending.resolve(approved);
  return true;
}
