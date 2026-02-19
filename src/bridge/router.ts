/** Route to backend based on specifier. */
export type BackendType = "acp" | "openai-compat";

export function parseBackendSpec(spec: string): { type: BackendType; value: string } | null {
  const s = spec.trim();
  if (s.startsWith("acp:")) {
    const value = s.slice(4).trim();
    return value ? { type: "acp", value } : null;
  }
  if (s.startsWith("openai-compat:")) {
    const value = s.slice(14).trim().replace(/\/$/, "");
    return value ? { type: "openai-compat", value } : null;
  }
  return null;
}
