import { createProgram, runCompatFromRawArgs } from "./cli.js";
import { EXIT, exit } from "./exit-codes.js";

runCompatFromRawArgs(process.argv.slice(2))
  .then(async (handled) => {
    if (handled) return;
    const program = createProgram();
    await program.parseAsync(process.argv);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    const code =
      message.includes("invalid") || message.includes("Unknown option") || message.includes("Invalid")
        ? EXIT.INVALID_ARGS
        : EXIT.GENERIC_ERROR;
    exit(code, undefined);
  });
