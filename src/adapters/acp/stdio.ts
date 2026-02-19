import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

export interface AcpStdioAdapter {
  write(line: string): void;
  onLine(cb: (line: string) => void): void;
  close(): void;
}

export function createAcpStdioAdapter(
  command: string,
  args: string[] = [],
  cwd?: string
): AcpStdioAdapter {
  const proc = spawn(command, args, {
    cwd: cwd ?? process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
  }) as ChildProcess & { stdin: NodeJS.WritableStream; stdout: NodeJS.ReadableStream };

  const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
  const listeners: ((line: string) => void)[] = [];

  rl.on("line", (line) => {
    for (const cb of listeners) cb(line);
  });

  proc.stderr?.on("data", (chunk) => {
    process.stderr.write(chunk);
  });

  return {
    write(line: string) {
      proc.stdin?.write(line + "\n");
    },
    onLine(cb: (line: string) => void) {
      listeners.push(cb);
    },
    close() {
      rl.close();
      proc.kill();
    },
  };
}
