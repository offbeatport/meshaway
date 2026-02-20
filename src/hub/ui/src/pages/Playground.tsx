import { useState, useEffect, useCallback, useRef } from "react";
import { Link } from "react-router-dom";
import { Checkbox } from "@base-ui/react/checkbox";
import { AppSelect } from "@/components/AppSelect";
import { SyntaxHighlight } from "@/components/SyntaxHighlight";
import {
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,

  Layers,
  ShieldCheck,
  Zap,
  Play,
  ChevronDown,
  ChevronRight,
  Download,
  RotateCcw,
  Copy,
  Plug,
  Unplug,
} from "lucide-react";
import { useHealthInfo } from "@/lib/useApi";
import {
  sendPlaygroundRunner,
  createPlaygroundSession,
  fetchPlaygroundFrames,
  playgroundControl,
  getSessionExportUrl,
  replayPlayground,
  type Frame,
} from "@/lib/api";

type Dialect = "copilot" | "acp";
type Transport = "tcp" | "stdio";

type PipelineId = "copilot-stdio-gemini" | "copilot-stdio-claude" | "copilot-stdio-opencode" | "acp-stdio-opencode";

const PIPELINE_OPTIONS: {
  value: PipelineId;
  label: string;
  part1: string;
  part2: string;
  part3: string;
  dialect: Dialect;
  transport: Transport;
  /** Agent command (e.g. "meshaway"). User specifies CLI path locally. */
  agentCommand: string;
  /** Agent args to spawn bridge (e.g. ["bridge", "--transport", "stdio", "--backend", "acp:gemini-cli"]). */
  agentArgs: string[];
}[] = [
    { value: "copilot-stdio-gemini", label: "Github Copilot SDK > stdio: Bridge > acp: Gemini", part1: "Github Copilot SDK", part2: "stdio: Bridge", part3: "acp: Gemini", dialect: "copilot", transport: "stdio", agentCommand: "meshaway", agentArgs: ["bridge", "--transport", "stdio", "--backend", "acp:gemini-cli"] },
    { value: "copilot-stdio-claude", label: "Github Copilot SDK > stdio: Bridge > acp: Claude Code", part1: "Github Copilot SDK", part2: "stdio: Bridge", part3: "acp: Claude Code", dialect: "copilot", transport: "stdio", agentCommand: "meshaway", agentArgs: ["bridge", "--transport", "stdio", "--backend", "acp:claude"] },
    { value: "copilot-stdio-opencode", label: "Github Copilot SDK > stdio: Bridge > acp: OpenCode", part1: "Github Copilot SDK", part2: "stdio: Bridge", part3: "acp: OpenCode", dialect: "copilot", transport: "stdio", agentCommand: "meshaway", agentArgs: ["bridge", "--transport", "stdio", "--backend", "acp:opencode"] },
    { value: "acp-stdio-opencode", label: "ACP Client SDK > stdio: Bridge > acp: OpenCode", part1: "ACP Client SDK", part2: "stdio: Bridge", part3: "acp: OpenCode", dialect: "acp", transport: "stdio", agentCommand: "meshaway", agentArgs: ["bridge", "--transport", "stdio", "--backend", "acp:opencode"] },
  ];

export function Playground() {
  const { healthInfo } = useHealthInfo();
  const [selectedPipeline, setSelectedPipeline] = useState<PipelineId>("copilot-stdio-gemini");
  const [dialect, setDialect] = useState<Dialect>("copilot");
  const [transport, setTransport] = useState<Transport>("stdio");
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
    bridgeTarget?: string;
    agentExec?: string | null;
    agentArgs?: string[];
    raw?: unknown;
  } | null>(null);
  const [frames, setFrames] = useState<Frame[]>([]);
  const [framesOpen, setFramesOpen] = useState(true);
  const [faultLatency, setFaultLatency] = useState(0);
  const [faultDrop, setFaultDrop] = useState(false);
  const [faultError, setFaultError] = useState("");
  const [killing, setKilling] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [replayJson, setReplayJson] = useState("");
  const [replaying, setReplaying] = useState(false);
  const [replayResults, setReplayResults] = useState<unknown[] | null>(null);
  const [bridgeTargetOverride] = useState("");
  const [toolsEnabled, setToolsEnabled] = useState(true);
  const [toolPolicy, setToolPolicy] = useState<"auto" | "ask" | "deny">("ask");
  const [selectedToolCallId, setSelectedToolCallId] = useState<string | null>(null);
  const [framesTab, setFramesTab] = useState<"events" | "frames">("events");
  const [frameSearch, setFrameSearch] = useState("");
  const [highlightedFrameId, setHighlightedFrameId] = useState<string | null>(null);

  const bridgeUrl = healthInfo?.bridgeUrl ?? "http://127.0.0.1:4321";
  const activeRunnerSessionId = lastResult?.runnerSessionId ?? runnerSessionId;
  runnerSessionIdRef.current = activeRunnerSessionId;
  const selectedOption = PIPELINE_OPTIONS.find((p) => p.value === selectedPipeline) ?? PIPELINE_OPTIONS[0];
  const inferredToolCalls = frames
    .filter((f) => {
      const p = f.payload as Record<string, unknown> | undefined;
      return (
        f.type.includes("tool") ||
        Boolean(p && (p.toolCallId || p.name || p.command))
      );
    })
    .map((f) => {
      const p = (f.payload || {}) as Record<string, unknown>;
      return {
        id: String(p.toolCallId ?? f.id),
        name: String(p.name ?? p.command ?? f.type),
        status: String(p.status ?? "pending"),
        args: p.args ?? p.arguments ?? p.params,
        result: p.result,
        timestamp: f.timestamp,
      };
    });
  const selectedToolCall = inferredToolCalls.find((t) => t.id === selectedToolCallId) ?? null;
  const playgroundStatus =
    lastResult?.error != null
      ? "error"
      : sending
        ? "streaming"
        : activeRunnerSessionId
          ? (lastResult?.status as string) || "connected"
          : "idle";
  const runStatus = playgroundStatus === "connected" ? "running" : playgroundStatus;

  const clientStatus = lastResult?.error ? "Error" : "Ready";
  const bridgeStatus = activeRunnerSessionId ? (lastResult?.error ? "Error" : "Connected") : "Disconnected";
  const backendStatus = activeRunnerSessionId ? (lastResult?.error ? "Error" : "Connected") : "Pending";

  const handlePipelineChange = (value: PipelineId) => {
    const option = PIPELINE_OPTIONS.find((p) => p.value === value);
    if (!option) return;
    setSelectedPipeline(value);
    setDialect(option.dialect);
    setTransport(option.transport);
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
    const bridgeTarget = bridgeTargetOverride.trim() || bridgeUrl;
    const option = PIPELINE_OPTIONS.find((p) => p.value === selectedPipeline) ?? PIPELINE_OPTIONS[0];
    createPlaygroundSession({
      clientType: dialect,
      transport,
      bridgeTarget: transport === "tcp" ? bridgeTarget : undefined,
      agentCommand: option.agentCommand,
      agentArgs: option.agentArgs,
    })
      .then(({ runnerSessionId: id, bridgeType, bridgeTarget, agentExec, agentArgs }) => {
        setRunnerSessionId(id);
        setLastResult({
          runnerSessionId: id,
          status: "connected",
          bridgeType,
          bridgeTarget,
          agentExec,
          agentArgs,
        });
      })
      .catch(() => { });
  }, [dialect, transport, selectedPipeline, bridgeTargetOverride, bridgeUrl]);

  useEffect(() => {
    resetRunner();
    handleConnect();
  }, [dialect, transport, selectedPipeline, bridgeTargetOverride, resetRunner, bridgeUrl]);

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
    const bridgeTarget = bridgeTargetOverride.trim() || bridgeUrl;
    const option = PIPELINE_OPTIONS.find((p) => p.value === selectedPipeline) ?? PIPELINE_OPTIONS[0];
    try {
      const res = await sendPlaygroundRunner({
        clientType: dialect,
        transport,
        bridgeTarget: transport === "tcp" ? bridgeTarget : undefined,
        agentCommand: option.agentCommand,
        agentArgs: option.agentArgs,
        prompt: prompt.trim(),
        runnerSessionId: activeRunnerSessionId || undefined,
        faultLatency: faultLatency > 0 ? faultLatency : undefined,
        faultDrop: faultDrop || undefined,
        faultError: faultError.trim() || undefined,
      });
      setRunnerSessionId(res.runnerSessionId);
      setLastResult({
        runnerSessionId: res.runnerSessionId,
        sessionId: res.sessionId,
        status: res.status,
        error: res.error,
        bridgeType: res.bridgeType,
        bridgeTarget: res.bridgeTarget,
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




  const handleReplay = async () => {
    let entries: Array<{ method: string; params?: unknown }>;
    try {
      entries = JSON.parse(replayJson || "[]");
    } catch {
      setReplayResults([{ error: "Invalid JSON array" }]);
      return;
    }
    if (!Array.isArray(entries)) {
      setReplayResults([{ error: "Expected JSON array of { method, params }" }]);
      return;
    }
    setReplaying(true);
    setReplayResults(null);
    try {
      const { results } = await replayPlayground(entries, bridgeUrl);
      setReplayResults(results);
    } catch (err) {
      setReplayResults([{ error: err instanceof Error ? err.message : "Replay failed" }]);
    } finally {
      setReplaying(false);
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
          Test translation and routing: choose dialect, send messages, watch frames and tool calls. No external client.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-400">
            Status: <span className="text-zinc-200">{runStatus}</span>
          </span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-zinc-400">
            Frames: {frames.length}
          </span>
          <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-zinc-400">
            Tool calls: {inferredToolCalls.length}
          </span>
        </div>
      </div>

      { }
      <section className="pt-5 border-t border-zinc-800">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <div className="flex flex-col max-w-md">
            <div className="flex items-center justify-between mb-2">
              <label className="text-[13px] font-medium text-zinc-400 tracking-tight">
                Client Type
              </label>
              <span className="text-[10px] uppercase tracking-widest text-zinc-600 font-bold">
                Stdio Bridge
              </span>
            </div>

            <AppSelect<PipelineId>
              value={selectedPipeline}
              onValueChange={handlePipelineChange}
              items={PIPELINE_OPTIONS.map((p) => ({
                value: p.value,
                label: `${p.part1} → ${p.part3}`,
                mutedSegment: p.part3.startsWith("acp: ") ? " → acp: " : undefined,
              }))}
              placeholder="Select a pipeline configuration..."
            />

            <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-[11px]">
              <span className="text-zinc-500">Status:</span>
              <span className="font-medium text-zinc-400">
                Client <span className={clientStatus === "Error" ? "text-red-400" : "text-zinc-300"}>{clientStatus}</span>
                <span className="text-zinc-600 mx-1">→</span>
                Bridge <span className={bridgeStatus === "Error" ? "text-red-400" : bridgeStatus === "Connected" ? "text-emerald-400" : "text-zinc-500"}>{bridgeStatus}</span>
                <span className="text-zinc-600 mx-1">→</span>
                Backend <span className={backendStatus === "Error" ? "text-red-400" : backendStatus === "Connected" ? "text-emerald-400" : "text-zinc-500"}>{backendStatus}</span>
              </span>
              <span className="text-zinc-500">Session ID:</span>
              <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-zinc-300">{activeRunnerSessionId || "—"}</code>

              </div>
              <span className="text-zinc-500">Transport:</span>
              <span className="font-medium text-zinc-400">STDIO (Meshaway Bridge)</span>
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
          <div className="flex flex-col min-h-0">
            <div className="mb-2 text-[11px] text-zinc-500">Client code</div>
            <SyntaxHighlight
              code={clientCode}
              language="javascript"
              noBackground
              preClassName="flex-1 min-h-[160px] max-h-56 p-3 text-xs font-mono rounded-lg overflow-auto "
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
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs text-zinc-500 font-mono">Bridge: {bridgeUrl}</span>
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

      {/* Tools panel */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-amber-400/80" />
            Tools
          </h2>
          <label className="inline-flex items-center gap-2 text-xs text-zinc-400">
            <Checkbox.Root
              checked={toolsEnabled}
              onCheckedChange={(v) => setToolsEnabled(!!v)}
              className="size-4 rounded border border-zinc-600 bg-zinc-800 data-[checked]:bg-sky-500 data-[checked]:border-sky-500 flex items-center justify-center"
            >
              <Checkbox.Indicator className="text-white">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2,6 5,9 10,3" />
                </svg>
              </Checkbox.Indicator>
            </Checkbox.Root>
            Tools enabled
          </label>
        </div>
        <p className="text-[11px] text-zinc-500">
          Parsed from incoming frames. Use policy controls to model expected approvals behavior.
        </p>

        <div className="max-w-xs">
          <div className="text-xs text-zinc-500 mb-1">Tool policy</div>
          <AppSelect<"auto" | "ask" | "deny">
            value={toolPolicy}
            onValueChange={setToolPolicy}
            items={[
              { value: "auto", label: "Auto" },
              { value: "ask", label: "Ask" },
              { value: "deny", label: "Deny" },
            ]}
            placeholder="Select policy"
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-2 max-h-52 overflow-auto">
            {inferredToolCalls.length === 0 ? (
              <p className="text-xs text-zinc-500">No tool calls yet.</p>
            ) : (
              inferredToolCalls.map((t) => (
                <button
                  key={`${t.id}-${t.timestamp}`}
                  type="button"
                  onClick={() => setSelectedToolCallId(t.id)}
                  className={`w-full text-left rounded-lg border px-3 py-2 ${selectedToolCallId === t.id
                    ? "border-sky-500/40 bg-sky-500/10"
                    : "border-zinc-700 bg-zinc-900/50 hover:bg-zinc-800/60"
                    }`}
                >
                  <div className="text-xs font-mono text-zinc-200 truncate">{t.name}</div>
                  <div className="text-[11px] text-zinc-500">{t.status}</div>
                </button>
              ))
            )}
          </div>
          <div className="rounded-lg border border-zinc-700 bg-zinc-900/50 p-3">
            {!selectedToolCall ? (
              <p className="text-xs text-zinc-500">Select a tool call to inspect args/output.</p>
            ) : (
              <>
                <p className="text-xs text-zinc-400 mb-1">Args</p>
                <pre className="max-h-24 overflow-auto text-[11px] text-zinc-300 font-mono bg-zinc-900 p-2 rounded">
                  {JSON.stringify(selectedToolCall.args, null, 2)}
                </pre>
                <p className="text-xs text-zinc-400 mt-3 mb-1">Output</p>
                <pre className="max-h-24 overflow-auto text-[11px] text-zinc-300 font-mono bg-zinc-900 p-2 rounded">
                  {JSON.stringify(selectedToolCall.result, null, 2)}
                </pre>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Record / Replay */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <RotateCcw className="h-4 w-4" />
          Record / Replay
        </h2>
        <p className="text-xs text-zinc-500">
          Export a session as JSONL for deterministic replay. Replay a JSON array of RPC calls through the bridge.
        </p>
        {sessionId && (
          <a
            href={getSessionExportUrl(sessionId)}
            download={`session-${sessionId}.jsonl`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300"
          >
            <Download className="h-4 w-4" />
            Export this session (JSONL)
          </a>
        )}
        <div>
          <label className="block text-xs text-zinc-500 mb-1">Replay entries (JSON array of {"{ method, params }"})</label>
          <textarea
            value={replayJson}
            onChange={(e) => setReplayJson(e.target.value)}
            placeholder={JSON.stringify([
              { method: "initialize", params: {} },
              { method: "prompt", params: { prompt: "Hello" } },
            ], null, 2)}
            rows={6}
            className="w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-3 py-2 text-zinc-100 text-xs font-mono placeholder-zinc-500 resize-y"
          />
          <button
            type="button"
            onClick={handleReplay}
            disabled={replaying}
            className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-600 text-zinc-200 text-sm hover:bg-zinc-500 disabled:opacity-50"
          >
            {replaying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            {replaying ? "Replaying…" : "Replay"}
          </button>
        </div>
        {replayResults !== null && (
          <details className="rounded border border-zinc-700 bg-zinc-900/60">
            <summary className="px-3 py-2 text-xs text-zinc-400 cursor-pointer">Replay results ({replayResults.length})</summary>
            <pre className="p-3 text-xs text-zinc-500 overflow-auto max-h-48">
              {JSON.stringify(replayResults, null, 2)}
            </pre>
          </details>
        )}
      </section>

      {/* Fault toggles */}
      <section className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-amber-200/90 flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Fault injection
        </h2>
        <div className="flex flex-wrap gap-4 items-center">
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            Latency (ms)
            <input
              type="number"
              min={0}
              max={30000}
              value={faultLatency || ""}
              onChange={(e) => setFaultLatency(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="w-20 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-zinc-100 text-sm"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-zinc-400 cursor-pointer">
            <Checkbox.Root
              checked={faultDrop}
              onCheckedChange={(checked) => setFaultDrop(!!checked)}
              className="size-4 rounded border border-zinc-600 bg-zinc-800 data-[checked]:bg-amber-500 data-[checked]:border-amber-500 flex items-center justify-center"
            >
              <Checkbox.Indicator className="text-white">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2,6 5,9 10,3" />
                </svg>
              </Checkbox.Indicator>
            </Checkbox.Root>
            Drop connection
          </label>
          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-400">Simulate error</label>
            <input
              type="text"
              value={faultError}
              onChange={(e) => setFaultError(e.target.value)}
              placeholder="e.g. Backend timeout"
              className="w-48 rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-zinc-100 text-sm placeholder-zinc-500"
            />
          </div>
        </div>
      </section>

      {/* Copilot Runner */}
      <section className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/20 p-5">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 mb-2">
          <Play className="h-4 w-4" />
          Copilot Runner
        </h2>
        <p className="text-xs text-zinc-500 mb-3">
          Run the example agent that uses the bridge via HTTP (same as this Playground). Session will appear in the Hub.
        </p>
        <code className="block text-xs font-mono text-zinc-400 bg-zinc-900/60 p-3 rounded">
          pnpm run runner
        </code>
        <p className="mt-2 text-xs text-zinc-500">
          Or open <Link to="/sessions" className="text-sky-400/90 hover:text-sky-400">Sessions</Link> to see live activity.
        </p>
      </section>
    </div >
  );
}
