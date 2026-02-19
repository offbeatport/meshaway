#!/usr/bin/env node
/**
 * Copilot Runner: example agent that sends prompts to the Meshaway bridge via the Hub API.
 * Run with: pnpm run runner
 * Ensure meshaway is running (Hub + Bridge). Session will appear in the Hub UI.
 */

const HUB_URL = process.env.MESH_HUB_URL ?? "http://127.0.0.1:7337";
const BRIDGE_URL = process.env.MESH_BRIDGE_URL ?? "http://127.0.0.1:4321";

async function sendPrompt(prompt: string, sessionId?: string): Promise<{ sessionId?: string; error?: string; raw?: unknown }> {
  const res = await fetch(`${HUB_URL}/api/playground/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      sessionId: sessionId || undefined,
      bridgeUrl: BRIDGE_URL,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    return { error: data?.error?.message ?? `HTTP ${res.status}` };
  }
  if (data.error) {
    return { error: data.error.message, raw: data };
  }
  return {
    sessionId: data.result?.sessionId,
    raw: data,
  };
}

async function main() {
  console.log("Copilot Runner → Hub:", HUB_URL, "→ Bridge:", BRIDGE_URL);
  const first = await sendPrompt("Say hello in one short sentence.");
  if (first.error) {
    console.error("Error:", first.error);
    process.exit(1);
  }
  console.log("Session:", first.sessionId ?? "(none)");
  if (first.sessionId) {
    const second = await sendPrompt("What is 2+2? Reply with just the number.", first.sessionId);
    if (second.error) console.error("Second prompt error:", second.error);
    else console.log("Second reply OK, session:", second.sessionId);
  }
  console.log("Done. Open the Hub UI to see the session and frames.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
