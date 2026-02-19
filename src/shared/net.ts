/**
 * Parse --listen value (e.g. "127.0.0.1:4321" or "4321") into host and port.
 */
export function parseListen(listen: string): { host: string; port: number } {
  const defaultHost = "127.0.0.1";
  const defaultPort = 4321;
  if (!listen || listen === "") return { host: defaultHost, port: defaultPort };
  const colon = listen.lastIndexOf(":");
  if (colon === -1) {
    const port = parseInt(listen, 10);
    if (Number.isNaN(port) || port <= 0 || port > 65535)
      return { host: defaultHost, port: defaultPort };
    return { host: defaultHost, port };
  }
  const host = listen.slice(0, colon).trim() || defaultHost;
  const port = parseInt(listen.slice(colon + 1), 10);
  if (Number.isNaN(port) || port <= 0 || port > 65535)
    return { host, port: defaultPort };
  return { host, port };
}

export async function findOpenPort(start: number): Promise<number> {
  const net = await import("node:net");
  for (let port = start; port < 65536; port++) {
    const ok = await new Promise<boolean>((r) => {
      const s = net.createServer();
      s.once("error", () => r(false));
      s.once("listening", () => {
        s.close(() => r(true));
      });
      s.listen(port, "127.0.0.1");
    });
    if (ok) return port;
  }
  throw new Error("No available port");
}
