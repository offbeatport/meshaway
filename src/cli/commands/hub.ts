import { startHub } from "../../hub/server.js";
import { parseListen } from "../../shared/net.js";
import { initLogger } from "../../shared/logging.js";
import { EXIT, exit } from "../../shared/errors.js";
import { DEFAULT_HUB_LISTEN } from "../../shared/constants.js";
import { openBrowser } from "../utils.js";

export async function runHub(
  opts: Record<string, string | boolean | undefined>
): Promise<void> {
  initLogger((opts.logLevel as string) || "info", "text");

  let host: string;
  let port: number;
  if (typeof opts.listen === "string" && opts.listen) {
    ({ host, port } = parseListen(opts.listen));
  } else {
    host = "127.0.0.1";
    const p = Number(opts.port);
    port = !isNaN(p) && p > 0 && p <= 65535 ? p : 7337;
  }

  try {
    const handle = await startHub({ host, port });
    const url = `http://${handle.host}:${handle.port}`;
    process.stderr.write(`Hub UI:      ${url}\n`);
    process.stderr.write(`Press Ctrl+C to stop.\n`);
    openBrowser(url);

    await new Promise<void>((_, reject) => {
      process.on("SIGINT", () =>
        handle.close().then(() => process.exit(EXIT.SUCCESS)).catch(reject)
      );
      process.on("SIGTERM", () =>
        handle.close().then(() => process.exit(EXIT.SUCCESS)).catch(reject)
      );
    });
  } catch (err) {
    process.stderr.write(String(err) + "\n");
    exit(EXIT.SERVER_FAILURE);
  }
}
