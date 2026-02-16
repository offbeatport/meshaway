import { createProgram } from "./cli.js";

const program = createProgram();
program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown startup error";
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
