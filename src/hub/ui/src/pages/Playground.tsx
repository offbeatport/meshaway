import { useState, useEffect, useCallback, useRef } from "react";
import { AppSelect } from "@/components/AppSelect";
import { SyntaxHighlight } from "@/components/SyntaxHighlight";
import Ansi from "ansi-to-react";
import {
  Send,
  Loader2,
  AlertCircle,
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
import {
  PLAYGROUND_PRESETS,
  DEFAULT_PLAYGROUND_PRESET_ID,
  type PlaygroundPresetId,
} from "@hub/playground/presets";

function formatFrameValue(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map((x) => formatFrameValue(x)).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function FrameRow({ frame }: { frame: Frame }) {
  const datetime = new Date(frame.timestamp).toISOString();
  const payloadObj =
    frame.payload !== null && typeof frame.payload === "object" && !Array.isArray(frame.payload)
      ? (frame.payload as Record<string, unknown>)
      : null;
  const copyJson = JSON.stringify({ type: frame.type, payload: frame.payload }, null, 2);

  return (
    <div
      className="grid grid-cols-[auto_1fr] gap-2 px-3 py-1.5 last:border-b-0"
    >
      <div className="text-zinc-500 shrink-0 select-none text-[11px]">{datetime}</div>
      <div className="flex items-start gap-2 p-3 hover:bg-zinc-800/20  rounded border border-zinc-800 bg-zinc-950 group">
        <div className="flex-1 min-w-0 space-y-0.5 text-[11px]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-zinc-500 shrink-0">type:</span>
            <span className="text-sky-400/90 font-medium">{frame.type}</span>
            {frame.redacted && (
              <span className="text-amber-500/80 text-[10px]">redacted</span>
            )}
          </div>
          {payloadObj && Object.keys(payloadObj).length > 0 && (
            <div className="text-zinc-400 space-y-0.5 pl-0">
              {Object.entries(payloadObj).map(([key, value]) => (
                <div key={key} className="flex gap-2 flex-wrap">
                  <span className="text-zinc-500 shrink-0">{key}:</span>
                  <span className="break-words min-w-0">{formatFrameValue(value)}</span>
                </div>
              ))}
            </div>
          )}
          {!payloadObj && frame.payload !== undefined && frame.payload !== null && (
            <div className="flex gap-2 flex-wrap">
              <span className="text-zinc-500 shrink-0">payload:</span>
              <span className="break-words min-w-0">{formatFrameValue(frame.payload)}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void navigator.clipboard?.writeText(copyJson)}
          className="text-zinc-500 hover:text-sky-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          Copy
        </button>
      </div>
    </div>
  );
}

export function Playground() {
  const [selectedPipeline, setSelectedPipeline] = useState<PlaygroundPresetId>(DEFAULT_PLAYGROUND_PRESET_ID);
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
  const [frameSearch, setFrameSearch] = useState("");
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionErrorSource, setSessionErrorSource] = useState<"bridge" | "agent" | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);

  const activeRunnerSessionId = lastResult?.runnerSessionId ?? runnerSessionId;
  runnerSessionIdRef.current = activeRunnerSessionId;
  const selectedOption = PLAYGROUND_PRESETS.find((p) => p.id === selectedPipeline) ?? PLAYGROUND_PRESETS[0];
  const lastSessionErrorFrame = [...frames].reverse().find((f) => f.type === "session.error");
  const sessionErrorPayload =
    lastSessionErrorFrame?.payload && typeof lastSessionErrorFrame.payload === "object"
      ? (lastSessionErrorFrame.payload as { message?: unknown; errorSource?: "bridge" | "agent" })
      : null;
  const sessionErrorFromFrame =
    sessionErrorPayload?.message != null && sessionErrorPayload?.message !== ""
      ? String(sessionErrorPayload.message)
      : lastSessionErrorFrame
        ? "Session error"
        : null;
  const hasSessionError = sessionError != null || lastSessionErrorFrame != null;
  const displaySessionError =
    (sessionError != null && sessionError !== "" ? sessionError : null) ??
    sessionErrorFromFrame ??
    (hasSessionError ? "Session error" : null);
  const displaySessionErrorSource =
    sessionError != null ? sessionErrorSource : sessionErrorPayload?.errorSource ?? null;
  const hasSessionCreated = frames.some((f) => f.type === "copilot.session.created");
  const connectionStatus: "Connected" | "Disconnected" | "Failed to connect" | "Connecting..." =
    isConnecting
      ? "Connecting..."
      : !activeRunnerSessionId
        ? "Disconnected"
        : hasSessionCreated
          ? "Connected"
          : hasSessionError
            ? "Failed to connect"
            : "Connecting...";

  const handlePipelineChange = (value: PlaygroundPresetId) => {
    if (!PLAYGROUND_PRESETS.some((p) => p.id === value)) return;
    setSelectedPipeline(value);
  };
  const agentArgsJson =
    "[\n" +
    selectedOption.cliArgs.map((a) => `    "${a}"`).join(",\n") +
    ",\n  ]";
  const clientCode = `const client = new CopilotClient({
  cliPath: "${selectedOption.cliPath}",
  cliArgs: ${agentArgsJson},
});`;



  const resetRunner = useCallback(() => {
    const id = runnerSessionIdRef.current;
    if (id) {
      playgroundControl(id, "reset").catch((err: unknown) => {
        setSessionError(err instanceof Error ? err.message : "Disconnect failed");
      });
    }
    setRunnerSessionId("");
    setSessionId("");
    setFrames([]);
    setLastResult(null);
  }, []);

  const handleConnect = useCallback(() => {
    setSessionError(null);
    setSessionErrorSource(null);
    setIsConnecting(true);
    const option = PLAYGROUND_PRESETS.find((p) => p.id === selectedPipeline) ?? PLAYGROUND_PRESETS[0];
    createPlaygroundSession({
      presetId: option.id,
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
        // Fetch frames immediately so session.connecting and other early frames show right away
        fetchPlaygroundFrames(id).then(setFrames).catch(() => setFrames([]));
      })
      .catch((err: unknown) => {
        const errWithSource = err as Error & { runnerSessionId?: string; errorSource?: "bridge" | "agent" };
        setSessionError(err instanceof Error ? err.message : "Connection failed");
        setSessionErrorSource(errWithSource.errorSource ?? null);
        const runnerId = errWithSource.runnerSessionId;
        if (runnerId) {
          setRunnerSessionId(runnerId);
          setLastResult((prev) => (prev ? { ...prev, runnerSessionId: runnerId } : { runnerSessionId: runnerId }));
          fetchPlaygroundFrames(runnerId).then(setFrames).catch(() => setFrames([]));
        }
      })
      .finally(() => {
        setIsConnecting(false);
      });
  }, [selectedPipeline]);

  useEffect(() => {
    resetRunner();
  }, [selectedPipeline, resetRunner]);

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
    try {
      const res = await sendPlaygroundRunner({
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
          Test translation: choose dialect, send messages, watch frames and tool calls.
        </p>
      </div>

      <section className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Client Session
        </h2>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)]">
          <div className="flex flex-col max-w-md">

            <AppSelect<PlaygroundPresetId>
              value={selectedPipeline}
              onValueChange={handlePipelineChange}
              items={PLAYGROUND_PRESETS.map((p) => ({
                value: p.id,
                label: (
                  <span className="inline-flex flex-wrap items-baseline gap-x-1">
                    <span>{p.from}</span>
                    <span className="text-zinc-500">→ Meshaway Bridge →</span>
                    <span>{p.to}</span>
                  </span>
                ),
              }))}
              placeholder="Select a pipeline configuration..."
            />

            <div className="mt-3 grid grid-cols-[auto_1fr] items-center gap-x-8 gap-y-2 text-[11px]">
              <span className="text-zinc-500">Status:</span>
              <span
                className={`font-medium text-zinc-400 flex items-center gap-1.5 ${connectionStatus === "Connecting..." ? "animate-pulse ease-in-out" : ""}`}
                title={connectionStatus}
              >
                <span className="relative inline-flex h-2 w-2 shrink-0">
                  {connectionStatus === "Connecting..." && (
                    <span
                      className="absolute inline-flex h-full w-full rounded-full bg-sky-400 opacity-75"
                      aria-hidden
                    />
                  )}
                  <span
                    className={`relative inline-block h-2 w-2 rounded-full ${connectionStatus === "Connected"
                      ? "bg-emerald-500"
                      : connectionStatus === "Failed to connect"
                        ? "bg-red-400"
                        : connectionStatus === "Connecting..."
                          ? "bg-sky-400"
                          : "bg-zinc-500"
                      }`}
                    aria-hidden
                  />
                </span>
                {connectionStatus}
              </span>

              <span className="text-zinc-500">Session ID:</span>
              <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-zinc-300">{activeRunnerSessionId || "—"}</code>
              </div>


              <span className="text-zinc-500">Transport:</span>
              <div className="flex min-w-0 items-center gap-2">
                <code className="min-w-0 flex-1 truncate font-mono text-zinc-300">stdio</code>
              </div>

              <span className="text-zinc-500">Manage:</span>
              <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                <button
                  type="button"
                  onClick={handleConnect}
                  disabled={connectionStatus === "Connecting..."}
                  className={
                    connectionStatus === "Connected"
                      ? "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-zinc-200 hover:bg-zinc-700"
                      : "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 disabled:opacity-50 font-medium"
                  }
                >
                  <Plug className="h-3.5 w-3.5" />
                  {connectionStatus === "Connected" ? "Reconnect" : "Connect"}
                </button>
                <span className="text-zinc-500 px-1" aria-hidden>/</span>
                <button
                  type="button"
                  onClick={resetRunner}
                  disabled={connectionStatus !== "Connected" && connectionStatus !== "Connecting..."}
                  className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-zinc-200 border border-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:pointer-events-none"
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
        {hasSessionError && displaySessionError != null && (
          <div className="col-span-2 mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2.5 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
              {displaySessionErrorSource && (
                <p className="text-[11px] font-semibold text-amber-400 uppercase tracking-wider">
                  {displaySessionErrorSource === "agent" ? "Agent error" : "Bridge error"}
                </p>
              )}
              {displaySessionErrorSource === "agent" && (
                <p className="text-sm text-amber-200/90">
                  The agent failed to start.
                </p>
              )}
              <Ansi
                className="text-sm text-amber-200/90 whitespace-pre-wrap break-words font-mono block"
              >
                {displaySessionError}
              </Ansi>
            </div>
          </div>
        )}
      </section>

      {/* Message + Send + Response (only when connected) */}
      <section
        className={`rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4 ${hasSessionCreated ? "" : "opacity-60 pointer-events-none"}`}
        aria-disabled={!hasSessionCreated}
      >
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Send className="h-4 w-4" />
          Message
        </h2>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (hasSessionCreated && (e.metaKey || e.ctrlKey) && e.key === "Enter" && !sending && prompt.trim()) {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder={hasSessionCreated ? "e.g. What is 2+2?" : "Connect to enable"}
          rows={3}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30 resize-y font-mono text-sm disabled:opacity-70"
          disabled={sending || !hasSessionCreated}
        />
        <div className="flex items-center justify-end flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !prompt.trim() || !hasSessionCreated}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 disabled:opacity-50 font-medium text-sm"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        <p className="text-[11px] text-zinc-500">Tip: press Cmd/Ctrl + Enter to send. Response and request appear in the Console below.</p>
        {lastResult?.error && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-amber-200">Error</p>
                <Ansi className="mt-1 text-sm text-zinc-400 block whitespace-pre-wrap break-words font-mono">
                  {lastResult.error}
                </Ansi>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Logging console (frames) */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <button
          type="button"
          onClick={() => setFramesOpen((o) => !o)}
          className="w-full flex items-center justify-between text-sm font-semibold text-zinc-300"
        >
          <span className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Console
            <span className="rounded-full border border-zinc-700 bg-zinc-900/60 px-2 py-0.5 text-[11px] text-zinc-400">
              {frames.length}
            </span>
          </span>
          {framesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        {framesOpen && (
          <div className="mt-3 space-y-3">
            <div className="flex justify-end">
              <input
                type="text"
                value={frameSearch}
                onChange={(e) => setFrameSearch(e.target.value)}
                placeholder="Search"
                className="w-full max-w-56 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-200 font-mono"
              />
            </div>
            {frames.length === 0 ? (
              <p className="text-xs text-zinc-500 font-mono">No log entries yet.</p>
            ) : (
              <div className="min-h-[756px] overflow-auto font-mono text-xs text-zinc-300">
                {frames
                  .filter((f) => !frameSearch || `${f.type} ${JSON.stringify(f.payload)}`.toLowerCase().includes(frameSearch.toLowerCase()))
                  .map((f) => (
                    <FrameRow key={`frame-${f.id}`} frame={f} />
                  ))}
              </div>
            )}
          </div>
        )}
      </section>

    </div>
  );
}
