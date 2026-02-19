/**
 * OpenAI-compatible HTTP adapter: call POST /v1/chat/completions (streaming).
 */

export interface OpenAIChatMessage {
  role: string;
  content: string;
}

export async function streamChatCompletions(
  baseUrl: string,
  apiKey: string | undefined,
  messages: OpenAIChatMessage[],
  onChunk: (text: string) => void
): Promise<{ stopReason: string }> {
  const url = `${baseUrl.replace(/\/$/, "")}/v1/chat/completions`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "text/event-stream",
  };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const body = JSON.stringify({
    model: "llama3.2",
    messages,
    stream: true,
  });

  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenAI-compat HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const data = line.slice(6);
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) onChunk(content);
        } catch {
          // skip
        }
      }
    }
  }

  return { stopReason: "end_turn" };
}
