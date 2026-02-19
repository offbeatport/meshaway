import { startBridgeServer } from "../../bridge/server.js";
import { runStdioBridge } from "../../bridge/stdio.js";
import { initLogger } from "../../shared/logging.js";
import { DEFAULT_BRIDGE_LISTEN } from "../../shared/constants.js";
import { getEnv } from "../../shared/env.js";

export async function runBridge(
  opts: Record<string, unknown>
): Promise<void> {
  initLogger(
    String((opts.verbose ? "debug" : opts.logLevel) || "info"),
    String((opts.logFormat as string) || "text")
  );

  const transport = String((opts.transport as string) || "tcp");
  const listen = (opts.listen as string) || getEnv("LISTEN") || DEFAULT_BRIDGE_LISTEN;
  const hubUrl = opts.noHub ? undefined : ((opts.hub as string) || getEnv("HUB"));

  if (transport === "stdio") {
    runStdioBridge();
    return;
  }

  const handle = await startBridgeServer(listen, {
    hubUrl,
    backend: (opts.backend as string) || getEnv("BACKEND"),
  });

  process.stderr.write(`Bridge URL:  http://${handle.host}:${handle.port}\n`);
  if (hubUrl) process.stderr.write(`Hub:         ${hubUrl}\n`);

  await new Promise<void>((_, reject) => {
    process.on("SIGINT", () =>
      handle.close().then(() => process.exit(EXIT.SUCCESS)).catch(reject)
    );
    process.on("SIGTERM", () =>
      handle.close().then(() => process.exit(EXIT.SUCCESS)).catch(reject)
    );
  });
}
