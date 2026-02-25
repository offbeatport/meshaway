import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";
import { log } from "../../shared/logging.js";
import { BridgeAgent } from "./base.js";

type JsonRpcId = string | number;

export interface BridgeAcpAgentOptions {
  /** Called when the agent sends a JSON-RPC notification (e.g. session/update). */
  onNotification?: (method: string, params: unknown) => void;
  /** Called when the agent sends a JSON-RPC request (e.g. session/request_permission). Handler returns result to send back. */
  onRequest?: (method: string, id: JsonRpcId, params: unknown) => Promise<unknown>;
  /** For testing: use these streams instead of spawning a process. */
  testStreams?: { stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream };
}

export class BridgeAcpAgent extends BridgeAgent {
  private proc: ChildProcess & { stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream };
  private rl: ReturnType<typeof createInterface>;
  private nextId = 1;
  private pending = new Map<
    JsonRpcId,
    { resolve: (value: unknown) => void; reject: (err: Error) => void; timer: NodeJS.Timeout }
  >();
  private readonly onNotification?: (method: string, params: unknown) => void;
  private readonly onRequest?: (method: string, id: JsonRpcId, params: unknown) => Promise<unknown>;

  constructor(cmd: string, args: string[] = [], options: BridgeAcpAgentOptions = {}) {
    super(cmd, args);
    this.onNotification = options.onNotification;
    this.onRequest = options.onRequest;

    if (options.testStreams) {
      this.proc = {
        stdin: options.testStreams.stdin,
        stdout: options.testStreams.stdout,
        stderr: null,
        on() {},
        kill() {},
      } as ChildProcess & { stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream };
    } else {
      log.debug(`Spawning agent: ${cmd} ${args.join(" ")}`);
      this.proc = spawn(cmd, args, {
        cwd: process.cwd(),
        stdio: ["pipe", "pipe", "pipe"],
      }) as ChildProcess & { stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream };
      this.proc.stderr?.on("data", (chunk: Buffer | string) => {
        log.error(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
      });
      this.proc.on("close", (code, signal) => {
        log.debug({ code, signal }, "Agent process exited");
        process.exit(code ?? 1);
      });
    }

    this.rl = createInterface({ input: this.proc.stdout, crlfDelay: Infinity });
    this.rl.on("line", (line) => this.onLine(line));
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

    if (id === undefined || id === null) {
      const method = typeof rec.method === "string" ? rec.method : "";
      if (method && this.onNotification) {
        this.onNotification(method, rec.params);
      }
      return;
    }

    if (typeof id !== "string" && typeof id !== "number") return;

    const method = typeof rec.method === "string" ? rec.method : "";
    if (method && this.onRequest) {
      this.handleIncomingRequest(id, method, rec.params);
      return;
    }

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

  private handleIncomingRequest(id: JsonRpcId, method: string, params: unknown): void {
    this.onRequest!(method, id, params)
      .then((result) => {
        this.proc.stdin?.write(
          JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n"
        );
      })
      .catch((err) => {
        this.proc.stdin?.write(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            error: {
              code: -32603,
              message: err instanceof Error ? err.message : "Internal error",
            },
          }) + "\n"
        );
      });
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
      pending.reject(new Error("ACP agent closed"));
      this.pending.delete(id);
    }
    this.rl.close();
    this.proc.kill();
  }
}
