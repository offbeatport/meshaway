import { test, expect } from "vitest";
import { fixturePath, runFixture } from "../helpers.js";

test("Copilot stdio: full flow (SDK → meshaway stdio → bridge → agent)", async () => {
  const result = await runFixture(
    fixturePath("stdio", "fixtures", "copilot-user-flow.mjs"),
    { MESHAWAY_DEBUG_ARGS: "1" },
  );

  expect(result.code, result.stderr + result.stdout).toBe(0);
  expect(result.stdout).toContain("COPILOT_FLOW_OK");
});
