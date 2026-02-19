import { describe, it, expect } from "vitest";
import { genId } from "../../shared/ids.js";

describe("genId", () => {
  it("generates unique ids", () => {
    const a = genId();
    const b = genId();
    expect(a).not.toBe(b);
  });

  it("uses prefix", () => {
    const id = genId("sess");
    expect(id).toMatch(/^sess-/);
  });
});
