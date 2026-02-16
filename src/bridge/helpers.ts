import type { PermissionDecision } from "../types.js";

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function extractSessionId(payload: unknown): string {
  const record = asRecord(payload);
  const params = asRecord(record.params);
  return stringValue(params.sessionId) ?? "default";
}

export function extractText(payload: unknown): string | undefined {
  const record = asRecord(payload);
  const params = asRecord(record.params);
  if (typeof params.prompt === "string") {
    return params.prompt;
  }
  if (Array.isArray(params.prompt)) {
    const firstText = params.prompt.find(
      (entry) => typeof entry === "object" && entry && (entry as Record<string, unknown>).type === "text",
    ) as Record<string, unknown> | undefined;
    if (firstText && typeof firstText.text === "string") {
      return firstText.text;
    }
  }
  if (typeof record.text === "string") {
    return record.text;
  }
  return undefined;
}

export function extractCommand(payload: unknown): string | undefined {
  const record = asRecord(payload);
  const params = asRecord(record.params);
  if (typeof params.command === "string") {
    return params.command;
  }
  if (typeof record.command === "string") {
    return record.command;
  }
  const toolUse = asRecord(params.tool_use);
  if (typeof toolUse.command === "string") {
    return toolUse.command;
  }
  return undefined;
}

export function isSensitiveCommand(command: string): boolean {
  const lowered = command.toLowerCase();
  return ["rm ", "npm publish", "git push --force", "chmod -r", "curl ", "wget "].some((frag) =>
    lowered.includes(frag),
  );
}

export function permissionDecisionToOutcome(decision: PermissionDecision): string {
  if (decision === "approved") {
    return "allow_once";
  }
  if (decision === "cancelled") {
    return "cancelled";
  }
  return "deny";
}
