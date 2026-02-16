import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "../../src/logging.js";

test("redacts API keys and token assignments", () => {
  const source = "ANTHROPIC_API_KEY=abcd1234 sk-live-super-secret ghp_12345678901234567890";
  const redacted = redactSecrets(source);
  assert.equal(redacted.includes("abcd1234"), false);
  assert.equal(redacted.includes("super-secret"), false);
  assert.equal(redacted.includes("ghp_12345678901234567890"), false);
});
