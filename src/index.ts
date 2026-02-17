import { createProgram } from "./cli.js";
import { EXIT, exit } from "./exit-codes.js";

if (process.env.MESHAWAY_DEBUG_ARGS) {
  process.stderr.write(`[DEBUG ARGS] argv: ${JSON.stringify(process.argv)}\n`);
}

const program = createProgram();
program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  const code =
    message.includes("invalid") || message.includes("Unknown option") || message.includes("Invalid")
      ? EXIT.INVALID_ARGS
      : EXIT.GENERIC_ERROR;
  exit(code, undefined);
});
