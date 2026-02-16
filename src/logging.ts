export function redactSecrets(input: string): string {
  return input
    .replace(/\bsk-[A-Za-z0-9_-]{16,}\b/g, "[REDACTED]")
    .replace(/\bghp_[A-Za-z0-9]{20,}\b/g, "[REDACTED]")
    .replace(/\bAIza[0-9A-Za-z\-_]{20,}\b/g, "[REDACTED]")
    .replace(
      /\b(ANTHROPIC_API_KEY|GITHUB_TOKEN|GOOGLE_API_KEY|OPENAI_API_KEY)\s*=\s*([^\s]+)/gi,
      (_match, name) => `${String(name)}=[REDACTED]`,
    )
    .replace(
      /\b(ANTHROPIC_API_KEY|GITHUB_TOKEN|GOOGLE_API_KEY|OPENAI_API_KEY)\b["']?\s*:\s*["']([^"']+)["']/gi,
      (_match, name) => `${String(name)}:"[REDACTED]"`,
    );
}

export function maskSensitiveObject<T>(value: T): T {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized) {
      return value;
    }
    return JSON.parse(redactSecrets(serialized)) as T;
  } catch {
    return value;
  }
}

export function safeLog(message: string, context?: unknown): void {
  if (context === undefined) {
    process.stderr.write(`${redactSecrets(message)}\n`);
    return;
  }
  const contextText = redactSecrets(JSON.stringify(context));
  process.stderr.write(`${redactSecrets(message)} ${contextText}\n`);
}
