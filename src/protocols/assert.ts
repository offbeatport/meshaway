import { type, type ArkErrors } from "arktype";

/** Asserts params match the schema and returns the validated value. Throws if validation fails. */
export function assertSchema<T>(
  schema: (value: unknown) => T,
  params: unknown,
  context: string
): Exclude<T, ArkErrors> {
  const out = schema(params);
  if (out instanceof type.errors) {
    const err = out as unknown as { summary: string };
    throw new Error(`Invalid ${context}: ${err.summary}`);
  }
  return out as Exclude<T, ArkErrors>;
}
