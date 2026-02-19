/** Simple approval tracking for dangerous tools. */
const pendingApprovals = new Map<string, { resolve: (decision: boolean) => void }>();

export function requestApproval(sessionId: string, toolCallId: string): Promise<boolean> {
  const key = `${sessionId}:${toolCallId}`;
  return new Promise((resolve) => {
    pendingApprovals.set(key, { resolve });
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
