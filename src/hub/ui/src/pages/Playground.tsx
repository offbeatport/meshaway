import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { AppSelect } from "@/components/AppSelect";
import { SyntaxHighlight } from "@/components/SyntaxHighlight";
import {
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Layers,
  Play,
  ChevronDown,
  ChevronRight,
  Plug,
  Unplug,
  Settings,
} from "lucide-react";
import {
  sendPlaygroundRunner,
  createPlaygroundSession,
  fetchPlaygroundFrames,
  playgroundControl,
  type Frame,
} from "@/lib/api";

type Dialect = "copilot" | "acp";

type PipelineId = "copilot-stdio-gemini" | "copilot-stdio-claude" | "copilot-stdio-opencode" | "acp-stdio-opencode";

const PIPELINE_OPTIONS: {
  value: PipelineId;
  label: string;
  part1: string;
  part2: string;
  part3: string;
  dialect: Dialect;
  /** Agent command (e.g. "meshaway"). User specifies CLI path locally. */
  agentCommand: string;
  /** Agent args to spawn bridge (e.g. ["bridge", "--backend", "acp:gemini-cli"]). */
  agentArgs: string[];
}[] = [
    { value: "copilot-stdio-gemini", label: "Github Copilot SDK > stdio: Bridge > acp: Gemini", part1: "Github Copilot SDK", part2: "stdio: Bridge", part3: "acp: Gemini", dialect: "copilot", agentCommand: "meshaway", agentArgs: ["bridge", "--backend", "acp:gemini-cli"] },
    { value: "copilot-stdio-claude", label: "Github Copilot SDK > stdio: Bridge > acp: Claude Code", part1: "Github Copilot SDK", part2: "stdio: Bridge", part3: "acp: Claude Code", dialect: "copilot", agentCommand: "meshaway", agentArgs: ["bridge", "--backend", "acp:claude"] },
    { value: "copilot-stdio-opencode", label: "Github Copilot SDK > stdio: Bridge > acp: OpenCode", part1: "Github Copilot SDK", part2: "stdio: Bridge", part3: "acp: OpenCode", dialect: "copilot", agentCommand: "meshaway", agentArgs: ["bridge", "--backend", "acp:opencode"] },
    { value: "acp-stdio-opencode", label: "ACP Client SDK > stdio: Bridge > acp: OpenCode", part1: "ACP Client SDK", part2: "stdio: Bridge", part3: "acp: OpenCode", dialect: "acp", agentCommand: "meshaway", agentArgs: ["bridge", "--backend", "acp:opencode"] },
  ];

export function Playground() {
  const [selectedPipeline, setSelectedPipeline] = useState<PipelineId>("copilot-stdio-gemini");
  const [dialect, setDialect] = useState<Dialect>("copilot");
  const [runnerSessionId, setRunnerSessionId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const runnerSessionIdRef = useRef("");
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{
    runnerSessionId?: string;
    sessionId?: string;
    status?: string;
    error?: string;
    bridgeType?: "tcp" | "stdio";
    agentExec?: string | null;
    agentArgs?: string[];
    raw?: unknown;
  } | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [framesOpen, setFramesOpen] = useState(true);
  const [framesTab, setFramesTab] = useState<"events" | "frames">("events");
  const [frameSearch, setFrameSearch] = useState("");
  const [highlightedFrameId, setHighlightedFrameId] = useState<string | null>(null);

  const activeRunnerSessionId = lastResult?.runnerSessionId ?? runnerSessionId;
  runnerSessionIdRef.current = activeRunnerSessionId;
  const selectedOption = PIPELINE_OPTIONS.find((p) => p.value === selectedPipeline) ?? PIPELINE_OPTIONS[0];
  const clientStatus = lastResult?.error ? "Error" : "Ready";
  const bridgeStatus = activeRunnerSessionId ? (lastResult?.error ? "Error" : "Connected") : "Disconnected";
  const backendStatus = activeRunnerSessionId ? (lastResult?.error ? "Error" : "Connected") : "Pending";

  const handlePipelineChange = (value: PipelineId) => {
    const option = PIPELINE_OPTIONS.find((p) => p.value === value);
    if (!option) return;
    setSelectedPipeline(value);
    setDialect(option.dialect);
  };
  const agentArgsJson =
    "[\n" +
    selectedOption.agentArgs.map((a) => `    "${a}"`).join(",\n") +
    ",\n  ]";
  const clientCode =
    dialect === "copilot"
      ? `const client = new CopilotClient({
  cliPath: "meshaway",
  cliArgs: ${agentArgsJson},
});`
      : `const client = new AcpClient({
  command: "meshaway",
  args: ${agentArgsJson},
});`;



  const resetRunner = useCallback(() => {
    const id = runnerSessionIdRef.current;
    if (id) playgroundControl(id, "reset").catch(() => { });
    setRunnerSessionId("");
    setSessionId("");
    setFrames([]);
    setLastResult(null);
  }, []);

  const handleConnect = useCallback(() => {
    const option = PIPELINE_OPTIONS.find((p) => p.value === selectedPipeline) ?? PIPELINE_OPTIONS[0];
    createPlaygroundSession({
      clientType: dialect,
      agentCommand: option.agentCommand,
      agentArgs: option.agentArgs,
    })
      .then(({ runnerSessionId: id, bridgeType, agentExec, agentArgs }) => {
        setRunnerSessionId(id);
        setLastResult({
          runnerSessionId: id,
          status: "connected",
          bridgeType,
          agentExec,
          agentArgs,
        });
      })
      .catch(() => { });
  }, [dialect, selectedPipeline]);

  useEffect(() => {
    resetRunner();
    handleConnect();
  }, [dialect, selectedPipeline, resetRunner, handleConnect]);

  const loadFrames = useCallback(async () => {
    if (!activeRunnerSessionId) return;
    try {
      const list = await fetchPlaygroundFrames(activeRunnerSessionId);
      setFrames(list);
    } catch {
      setFrames([]);
    }
  }, [activeRunnerSessionId]);

  useEffect(() => {
    if (!activeRunnerSessionId) return;
    loadFrames();
    const id = setInterval(loadFrames, 1500);
    return () => clearInterval(id);
  }, [activeRunnerSessionId, loadFrames]);

  const handleSend = async () => {
    if (!prompt.trim()) return;
    setSending(true);
    setLastResult(null);
    const option = PIPELINE_OPTIONS.find((p) => p.value === selectedPipeline) ?? PIPELINE_OPTIONS[0];
    try {
      const res = await sendPlaygroundRunner({
        clientType: dialect,
        agentCommand: option.agentCommand,
        agentArgs: option.agentArgs,
        prompt: prompt.trim(),
        runnerSessionId: activeRunnerSessionId || undefined,
      });
      setRunnerSessionId(res.runnerSessionId);
      setLastResult({
        runnerSessionId: res.runnerSessionId,
        sessionId: res.sessionId,
        status: res.status,
        error: res.error,
        bridgeType: res.bridgeType,
        agentExec: res.agentExec,
        agentArgs: res.agentArgs,
        raw: res,
      });
      if (res.sessionId && !sessionId.trim()) setSessionId(res.sessionId);
      loadFrames();
    } catch (err) {
      setLastResult({ error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setSending(false);
    }
  };




  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="mb-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-zinc-100">
          <Play className="h-6 w-6 text-sky-400/80" />
          Playground
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Test translation: choose dialect, send messages, watch frames and tool calls. No external client.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Client Configuration
        </h2>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          <div className="flex flex-col max-w-md">

            <AppSelect<PipelineId>
              value={selectedPipeline}
              onValueChange={handlePipelineChange}
              items={PIPELINE_OPTIONS.map((p) => ({
                value: p.value,
                label: `${p.part1} → stdio → ${p.part3}`,
                mutedSegment: p.part3.startsWith("acp: ") ? " → stdio → acp: " : undefined,
              }))}
              placeholder="Select a pipeline configuration..."
            />

            <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-[11px]">
              <span className="text-zinc-500">Status:</span>
              <span className="font-medium text-zinc-400 flex items-center gap-1.5">
                <span
                  title={`Client: ${clientStatus}`}
                  className="flex items-center gap-1 cursor-default"
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full shrink-0 ${clientStatus === "Error" ? "bg-red-400" : "bg-emerald-500"}`}
                    aria-hidden
                  />
                  Client
                </span>
                <span className="text-zinc-600">→</span>
                <span
                  title={`Bridge: ${bridgeStatus}`}
                  className="flex items-center gap-1 cursor-default"
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full shrink-0 ${bridgeStatus === "Error" ? "bg-red-400" : bridgeStatus === "Connected" ? "bg-emerald-500" : "bg-zinc-500"}`}
                    aria-hidden
                  />
                  Bridge
                </span>
                <span className="text-zinc-600">→</span>
                <span
                  title={`Backend: ${backendStatus}`}
                  className="flex items-center gap-1 cursor-default"
                >
                  <span
                    className={`inline-block h-2 w-2 rounded-full shrink-0 ${backendStatus === "Error" ? "bg-red-400" : backendStatus === "Connected" ? "bg-emerald-500" : "bg-zinc-500"}`}
                    aria-hidden
                  />
                  Backend
                </span>
              </span>
              <span className="text-zinc-500">Session ID:</span>
              <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-zinc-300">{activeRunnerSessionId || "—"}</code>

              </div>
              <span className="text-zinc-500">Manage:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleConnect}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-zinc-200 hover:bg-zinc-700"
                >
                  <Plug className="h-3.5 w-3.5" />
                  Reconnect
                </button>
                /
                <button
                  type="button"
                  onClick={resetRunner}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-zinc-200 hover:bg-zinc-700"
                >
                  <Unplug className="h-3.5 w-3.5" />
                  Disconnect
                </button>
              </div>
            </div>
          </div>
          <div className="flex flex-col min-h-0 rounded-lg bg-zinc-800/40 p-3">
            <div className="mb-1.5 text-[11px] text-zinc-500">Client code</div>
            <SyntaxHighlight
              code={clientCode}
              language="javascript"
              noBackground
              preClassName="flex-1 min-h-[100px] max-h-44 p-2.5 text-[11px] font-mono rounded overflow-auto"
            />
          </div>
        </div>
      </section>





      {/* Message + Send + Response */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Send className="h-4 w-4" />
          Message
        </h2>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !sending && prompt.trim()) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder="e.g. What is 2+2?"
          rows={3}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30 resize-y font-mono text-sm"
          disabled={sending}
        />
        <div className="flex items-center justify-end flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !prompt.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 disabled:opacity-50 font-medium text-sm"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        <p className="text-[11px] text-zinc-500">Tip: press Cmd/Ctrl + Enter to send.</p>
        {lastResult && (
          <div
            className={`rounded-lg border p-4 ${lastResult.error
              ? "border-amber-500/30 bg-amber-500/5"
              : "border-sky-500/20 bg-sky-500/5"
              }`}
          >
            {lastResult.error ? (
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-amber-200">Error</p>
                  <p className="mt-1 text-sm text-zinc-400">{lastResult.error}</p>
                </div>
              </div>
            ) : (
              <div className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-sky-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-sky-200">OK</p>
                  {lastResult.sessionId && (
                    <Link
                      to={`/sessions/${lastResult.sessionId}`}
                      className="mt-1 inline-flex items-center gap-1.5 text-sm text-sky-400 hover:text-sky-300"
                    >
                      View session <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>
              </div>
            )}
            <details className="mt-3">
              <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-400">Raw response</summary>
              <pre className="mt-2 p-3 rounded bg-zinc-900/80 text-xs text-zinc-400 overflow-auto max-h-40">
                {JSON.stringify(lastResult.raw, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </section>

      {/* Raw frames viewer */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <button
          type="button"
          onClick={() => setFramesOpen((o) => !o)}
          className="w-full flex items-center justify-between text-sm font-semibold text-zinc-300"
        >
          <span className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Raw frames
            <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[11px] text-zinc-400">
              {frames.length}
            </span>
          </span>
          {framesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {framesOpen && (
          <div className="mt-3 space-y-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setFramesTab("events")}
                className={`px-2.5 py-1 rounded text-xs ${framesTab === "events" ? "bg-zinc-700 text-zinc-100" : "bg-zinc-800/50 text-zinc-400"}`}
              >
                Events
              </button>
              <button
                type="button"
                onClick={() => setFramesTab("frames")}
                className={`px-2.5 py-1 rounded text-xs ${framesTab === "frames" ? "bg-zinc-700 text-zinc-100" : "bg-zinc-800/50 text-zinc-400"}`}
              >
                Frames
              </button>
              <input
                type="text"
                value={frameSearch}
                onChange={(e) => setFrameSearch(e.target.value)}
                placeholder="Search frames"
                className="ml-auto w-full max-w-56 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200"
              />
            </div>
            {frames.length === 0 ? (
              <p className="text-xs text-zinc-500">No frames yet.</p>
            ) : framesTab === "events" ? (
              <div className="space-y-1.5 max-h-64 overflow-auto">
                {frames
                  .filter((f) => !frameSearch || `${f.type} ${JSON.stringify(f.payload)}`.toLowerCase().includes(frameSearch.toLowerCase()))
                  .map((f) => (
                    <button
                      key={`event-${f.id}`}
                      type="button"
                      onClick={() => {
                        setHighlightedFrameId(f.id);
                        setFramesTab("frames");
                      }}
                      className="w-full text-left rounded border border-zinc-700 bg-zinc-900/50 px-3 py-2 hover:bg-zinc-800/60"
                    >
                      <div className="text-xs text-zinc-200 font-mono truncate">{f.type}</div>
                      <div className="text-[11px] text-zinc-500">{new Date(f.timestamp).toISOString()}</div>
                    </button>
                  ))}
              </div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-auto">
                {frames
                  .filter((f) => !frameSearch || `${f.type} ${JSON.stringify(f.payload)}`.toLowerCase().includes(frameSearch.toLowerCase()))
                  .map((f) => (
                    <div
                      key={`frame-${f.id}`}
                      className={`rounded border p-2 ${highlightedFrameId === f.id ? "border-sky-500/50 bg-sky-500/10" : "border-zinc-700 bg-zinc-900/50"}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <code className="text-xs text-zinc-300 font-mono">{f.type}</code>
                        <button
                          type="button"
                          onClick={() => void navigator.clipboard?.writeText(JSON.stringify(f.payload, null, 2))}
                          className="text-[11px] text-sky-400 hover:text-sky-300"
                        >
                          Copy
                        </button>
                      </div>
                      <pre className="text-[11px] text-zinc-400 overflow-auto whitespace-pre-wrap">
                        {JSON.stringify(f.payload, null, 2)}
                      </pre>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </section>

    </div>
  );
}
