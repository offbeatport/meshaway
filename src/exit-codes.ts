/** CLI exit codes per meshaway-cli-v1 spec. */
export const EXIT = {
  SUCCESS: 0,
  GENERIC_ERROR: 1,
  INVALID_ARGS: 2,
  SERVER_FAILURE: 3,
  BACKEND_FAILURE: 4,
} as const;

export function exit(code: number, message?: string): never {
  if (message) {
    if (code === EXIT.SUCCESS) process.stdout.write(`${message}\n`);
    else process.stderr.write(`${message}\n`);
  }
  process.exit(code);
}
