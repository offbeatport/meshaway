import { describe, it, expect } from "vitest";
import { jsonRpcError, jsonRpcResult } from "../../src/protocols/jsonrpc/response.js";

describe("jsonRpcError", () => {
  it("uses Error message when errorOrData is Error", () => {
    const res = jsonRpcError(1, -32600, "Fallback", new Error("Actual message"));
    expect(res.error.message).toBe("Actual message");
    expect(res.id).toBe(1);
    expect(res.error.code).toBe(-32600);
  });

  it("uses fallback message and optional data when errorOrData is not Error", () => {
    const res = jsonRpcError(null, -32000, "Server error", { detail: "extra" });
    expect(res.error.message).toBe("Server error");
    expect(res.error.data).toEqual({ detail: "extra" });
    expect(res.id).toBeNull();
  });
});

describe("jsonRpcResult", () => {
  it("returns result envelope", () => {
    const res = jsonRpcResult(42, { ok: true });
    expect(res).toEqual({ jsonrpc: "2.0", id: 42, result: { ok: true } });
  });
});
