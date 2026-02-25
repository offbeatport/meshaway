import { describe, it, expect } from "vitest";
import {
  parseEnvelope,
  isRequest,
  isResponse,
} from "../../src/protocols/jsonrpc/validate.js";

describe("parseEnvelope", () => {
  it("accepts valid request", () => {
    const req = { jsonrpc: "2.0", id: 1, method: "ping", params: {} };
    expect(parseEnvelope(req)).toEqual(req);
  });

  it("accepts valid response with result", () => {
    const res = { jsonrpc: "2.0", id: 1, result: { ok: true } };
    expect(parseEnvelope(res)).toEqual(res);
  });

  it("accepts valid response with error", () => {
    const res = { jsonrpc: "2.0", id: 1, error: { code: -32600, message: "Invalid" } };
    expect(parseEnvelope(res)).toEqual(res);
  });

  it("throws on invalid jsonrpc version", () => {
    expect(() => parseEnvelope({ jsonrpc: "1.0", id: 1, method: "ping" })).toThrow(
      /Invalid JSON-RPC/
    );
  });

  it("throws on non-object", () => {
    expect(() => parseEnvelope(null)).toThrow(/Invalid JSON-RPC/);
    expect(() => parseEnvelope("string")).toThrow(/Invalid JSON-RPC/);
  });
});

describe("isRequest", () => {
  it("returns true for message with method", () => {
    expect(isRequest({ jsonrpc: "2.0", id: 1, method: "ping" })).toBe(true);
  });

  it("returns false for response", () => {
    expect(isRequest({ jsonrpc: "2.0", id: 1, result: {} })).toBe(false);
    expect(isRequest({ jsonrpc: "2.0", id: 1, error: { code: 0, message: "x" } })).toBe(false);
  });
});

describe("isResponse", () => {
  it("returns true for result", () => {
    expect(isResponse({ jsonrpc: "2.0", id: 1, result: {} })).toBe(true);
  });

  it("returns true for error", () => {
    expect(isResponse({ jsonrpc: "2.0", id: 1, error: { code: 0, message: "x" } })).toBe(true);
  });

  it("returns false for request", () => {
    expect(isResponse({ jsonrpc: "2.0", id: 1, method: "ping" })).toBe(false);
  });
});
