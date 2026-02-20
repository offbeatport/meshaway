import { runStdioBridge } from "../../bridge/stdio.js";
import { initLogger } from "../../shared/logging.js";
import { getEnv } from "../../shared/env.js";

export async function runBridge(
  opts: Record<string, unknown>
): Promise<void> {
  initLogger(
    String((opts.verbose ? "debug" : opts.logLevel) || "info"),
    String((opts.logFormat as string) || "text")
  );

  // When starting in bridge mode, ignore all CLI arguments/commands; use only env.
  const agent = getEnv("AGENT") || getEnv("BACKEND");
  runStdioBridge(agent || undefined, undefined);
}
