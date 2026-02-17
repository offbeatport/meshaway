import { test, expect } from "vitest";
import { fixturePath, runFixture } from "../helpers.js";

test.skip("Claude stdio: full flow (SDK → meshaway → bridge → agent)", async () => {
  const result = await runFixture(fixturePath("stdio", "fixtures", "claude-user-flow.mjs"));

  expect(result.code, result.stderr + result.stdout).toBe(0);
  expect(result.stdout).toContain("CLAUDE_FLOW_OK");
});
