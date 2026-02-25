import { describe, it, expect } from "vitest";
import { parseListen } from "../../src/shared/net.js";

describe("parseListen", () => {
  it("returns default host and port for empty string", () => {
    expect(parseListen("")).toEqual({ host: "127.0.0.1", port: 4321 });
  });

  it("parses port-only (number)", () => {
    expect(parseListen("7337")).toEqual({ host: "127.0.0.1", port: 7337 });
  });

  it("parses host:port", () => {
    expect(parseListen("127.0.0.1:7337")).toEqual({ host: "127.0.0.1", port: 7337 });
    expect(parseListen("0.0.0.0:3000")).toEqual({ host: "0.0.0.0", port: 3000 });
  });

  it("uses default port when port is invalid", () => {
    expect(parseListen("99999")).toEqual({ host: "127.0.0.1", port: 4321 });
    expect(parseListen("0")).toEqual({ host: "127.0.0.1", port: 4321 });
    expect(parseListen("127.0.0.1:bad")).toEqual({ host: "127.0.0.1", port: 4321 });
  });

  it("uses default host when host is empty after colon", () => {
    expect(parseListen(":8080")).toEqual({ host: "127.0.0.1", port: 8080 });
  });
});
