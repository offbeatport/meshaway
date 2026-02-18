import { createProgram } from "./cli.js";
import { EXIT, exit } from "./exit-codes.js";
import { getDataDir, ensureDefaultConfig } from "./config.js";


async function main() {
  // Ensure ~/.meshaway/meshaway.json exists with defaults on first run.
  await ensureDefaultConfig(getDataDir());

  if (process.env.MESHAWAY_DEBUG_ARGS) {
    process.stderr.write(`[DEBUG ARGS] argv: ${JSON.stringify(process.argv)}\n`);
  }

  const program = createProgram();
  await program.parseAsync(process.argv);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  const code =
    message.includes("invalid") || message.includes("Unknown option") || message.includes("Invalid")
      ? EXIT.INVALID_ARGS
      : EXIT.GENERIC_ERROR;
  exit(code, undefined);
});
