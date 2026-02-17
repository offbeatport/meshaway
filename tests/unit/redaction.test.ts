import { test, expect } from "vitest";
import { redactSecrets } from "../../src/logging.js";

test("redacts API keys and token assignments", () => {
  const source = "ANTHROPIC_API_KEY=abcd1234 sk-live-super-secret ghp_12345678901234567890";
  const redacted = redactSecrets(source);
  expect(redacted.includes("abcd1234")).toBe(false);
  expect(redacted.includes("super-secret")).toBe(false);
  expect(redacted.includes("ghp_12345678901234567890")).toBe(false);
});
