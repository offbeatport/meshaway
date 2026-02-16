import { createProgram, runCompatFromRawArgs } from "./cli.js";

runCompatFromRawArgs(process.argv.slice(2))
  .then(async (handled) => {
    if (handled) {
      return;
    }
    const program = createProgram();
    await program.parseAsync(process.argv);
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown startup error";
    process.stderr.write(`${message}\n`);
    process.exit(1);
  });
