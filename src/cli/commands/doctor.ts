import { spawn } from "node:child_process";
import { getEnv } from "../../shared/env.js";
import { OLLAMA_DEFAULT_URL } from "../../shared/constants.js";

export async function runDoctor(
  _opts: { agent?: string; dataDir?: string }
): Promise<void> {
  process.stderr.write("Meshaway doctor\n");
  process.stderr.write("───────────────────────────────────────────────────────────────\n\n");

  const backend = getEnv("BACKEND");
  if (backend) {
    process.stderr.write(`Backend (MESH_BACKEND): ${backend}\n`);
  } else {
    process.stderr.write("Backend: not set (MESH_BACKEND)\n");
  }

  const ollamaOk = await checkOllama();
  process.stderr.write(
    ollamaOk
      ? `Ollama:      reachable at ${OLLAMA_DEFAULT_URL}\n`
      : `Ollama:      not reachable at ${OLLAMA_DEFAULT_URL}\n`
  );

  process.stderr.write("\n");
  process.stderr.write("Fix:\n");
  process.stderr.write(
    "  - Local Ollama: meshaway --backend openai-compat:http://127.0.0.1:11434/v1\n"
  );
  process.stderr.write("  - ACP backend:  meshaway --backend acp:gemini-cli\n");
  process.stderr.write("  - Or set:      MESH_BACKEND=...\n");
  process.stderr.write("───────────────────────────────────────────────────────────────\n");
}

async function checkOllama(): Promise<boolean> {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 2000);
  try {
    const res = await fetch(`${OLLAMA_DEFAULT_URL}/api/tags`, {
      signal: ctrl.signal,
    });
    return res.ok;
  } catch {
    return false;
  }
}
