import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { log } from "../../shared/logging.js";
import { BridgeAgent } from "./base.js";

type JsonRpcId = string | number;

export class AcpAgentClient extends BridgeAgent {
  private proc: ChildProcess & { stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream };
  private rl: ReturnType<typeof createInterface>;
  private nextId = 1;
  private pending = new Map<
    JsonRpcId,
    { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();

  constructor(cmd: string, args: string[] = []) {
    super();
    log.info(`Spawning agent: ${cmd} ${args.join(" ")}`);
    this.proc = spawn(cmd, args, {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    }) as ChildProcess & { stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream };

    this.rl = createInterface({ input: this.proc.stdout, crlfDelay: Infinity });
    this.rl.on("line", (line) => this.onLine(line));

    this.proc.stderr?.on("data", (chunk: Buffer | string) => {
      log.error(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
    });

    // Use "close" not "exit" so we don't process.exit() before the event loop
    // has delivered the last stdout/stderr chunks (and thus don't miss final messages).
    this.proc.on("close", (code, signal) => {
      log.info({ code, signal }, "Agent process exited");
      process.exit(code ?? 1);
    });
  }

  private onLine(line: string): void {
    let msg: unknown;
    try {
      msg = JSON.parse(line) as unknown;
    } catch {
      return;
    }
    if (!msg || typeof msg !== "object") return;
    const rec = msg as Record<string, unknown>;
    const id = rec.id;
    if (id === undefined || id === null) return;
    if (typeof id !== "string" && typeof id !== "number") return;
    const pending = this.pending.get(id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(id);
    if (rec.error && typeof rec.error === "object") {
      const err = rec.error as Record<string, unknown>;
      pending.reject(new Error(String(err.message ?? "ACP agent error")));
      return;
    }
    pending.resolve(rec.result);
  }

  async request(method: string, params: unknown, timeoutMs = 60000): Promise<unknown> {
    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };
    const promise = new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`ACP request timeout: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.proc.stdin?.write(JSON.stringify(payload) + "\n");
    return promise;
  }

  override close(): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(new Error("ACP client closed"));
      this.pending.delete(id);
    }
    this.rl.close();
    this.proc.kill();
  }
}
