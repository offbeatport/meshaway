/** Route to backend based on specifier. MVP: ACP only. */
export type BackendType = "acp";

export function parseBackendSpec(spec: string): { type: BackendType; value: string } | null {
  const s = spec.trim();
  if (s.startsWith("acp:")) {
    const value = s.slice(4).trim();
    return value ? { type: "acp", value } : null;
  }
  return null;
}
