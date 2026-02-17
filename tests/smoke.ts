import { UnifiedTranslator } from "../src/translator/index.js";

const translator = new UnifiedTranslator();
const acp = translator.githubToAcp({
  jsonrpc: "2.0",
  id: 1,
  method: "session/prompt",
  params: {
    sessionId: "smoke",
    prompt: "hello world",
  },
});
if (!acp.length) {
  throw new Error("Translator did not emit ACP message");
}

process.stdout.write("Smoke checks passed\n");
