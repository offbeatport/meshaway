import { test, expect } from "vitest";
import { redactSecrets } from "../../src/logging.js";

test("redacts API keys and token assignments", () => {
  const redacted = redactSecrets(
    "ANTHROPIC_API_KEY=abcd1234 sk-live-super-secret ghp_12345678901234567890",
  );
  expect(redacted).not.toContain("abcd1234");
  expect(redacted).not.toContain("super-secret");
  expect(redacted).not.toContain("ghp_12345678901234567890");
});
