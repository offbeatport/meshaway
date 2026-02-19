import { getEnv } from "../../shared/env.js";
import { getPackageJsonVersion } from "../utils.js";

export async function runStatus(
  _opts: { dataDir?: string }
): Promise<void> {
  const backend = getEnv("BACKEND");
  const listen = getEnv("LISTEN");
  const hub = getEnv("HUB");
  const hubListen = getEnv("HUB_LISTEN");

  const status = {
    version: getPackageJsonVersion(),
    backend: backend ?? "not set",
    bridgeListen: listen ?? "127.0.0.1:4321 (default)",
    hub: hub ?? "not set",
    hubListen: hubListen ?? "127.0.0.1:7337 (default)",
  };

  process.stdout.write(JSON.stringify(status, null, 2) + "\n");
}
