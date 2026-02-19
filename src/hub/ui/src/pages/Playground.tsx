import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  Send,
  Loader2,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Skull,
  Square,
  Layers,
  ShieldCheck,
  Zap,
  Play,
  ChevronDown,
  ChevronRight,
  Download,
  RotateCcw,
} from "lucide-react";
import { useHealthInfo, useApprovals } from "@/lib/useApi";
import {
  sendPlaygroundPrompt,
  sendPlaygroundRpc,
  setRoutingBackend,
  fetchFrames,
  killSession,
  getSessionExportUrl,
  replayPlayground,
  type Frame,
  type PendingApproval,
} from "@/lib/api";

type Dialect = "copilot" | "acp";

const COMMON_BACKENDS = [
  "acp:gemini-cli",
  "openai-compat:http://127.0.0.1:11434/v1",
  "openai-compat:http://127.0.0.1:8080/v1",
];

export function Playground() {
  const { healthInfo } = useHealthInfo();
  const { approvals, resolve, refresh: refreshApprovals } = useApprovals(2000);
  const [dialect, setDialect] = useState<Dialect>("copilot");
  const [sessionId, setSessionId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [backendOverride, setBackendOverride] = useState("");
  const [sending, setSending] = useState(false);
  const [lastResult, setLastResult] = useState<{
    sessionId?: string;
    error?: string;
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

  const bridgeUrl = healthInfo?.bridgeUrl ?? "http://127.0.0.1:4321";
  const currentBackend = healthInfo?.backend ?? "not configured";
  const sessionApprovals = sessionId
    ? approvals.filter((a) => a.sessionId === sessionId)
    : [];

  const loadFrames = useCallback(async () => {
    if (!sessionId) return;
    try {
      const list = await fetchFrames(sessionId);
      setFrames(list);
    } catch {
      setFrames([]);
    }
  }, [sessionId]);

  useEffect(() => {
    loadFrames();
    const id = setInterval(loadFrames, 2000);
    return () => clearInterval(id);
  }, [loadFrames]);

  const handleNewAcpSession = async () => {
    setSending(true);
    setLastResult(null);
    try {
      const init = await sendPlaygroundRpc({
        method: "initialize",
        params: {},
        bridgeUrl,
      });
      if ((init as { error?: unknown }).error) {
        setLastResult({ error: (init as { error: { message?: string } }).error?.message ?? "Initialize failed" });
        return;
      }
      const sessionRes = await sendPlaygroundRpc({
        method: "session/new",
        params: { cwd: ".", mcpServers: [] },
        bridgeUrl,
      });
      const result = sessionRes.result as { sessionId?: string } | undefined;
      const sid = result?.sessionId;
      if (sid) {
        setSessionId(sid);
        setLastResult({ sessionId: sid, raw: sessionRes });
      } else {
        setLastResult({ error: "session/new returned no sessionId", raw: sessionRes });
      }
    } catch (err) {
      setLastResult({ error: err instanceof Error ? err.message : "Failed" });
    } finally {
      setSending(false);
    }
  };

  const handleSend = async () => {
    if (!prompt.trim()) return;
    setSending(true);
    setLastResult(null);
    const faultPayload = {
      ...(faultLatency > 0 && { faultLatency }),
      ...(faultDrop && { faultDrop: true }),
      ...(faultError.trim() && { faultError: faultError.trim() }),
    };
    try {
      if (dialect === "acp") {
        if (!sessionId.trim()) {
          setLastResult({ error: "Start an ACP session first (New ACP session)" });
          setSending(false);
          return;
        }
        const res = await sendPlaygroundRpc({
          method: "session/prompt",
          params: {
            sessionId: sessionId.trim(),
            prompt: [{ type: "text", text: prompt.trim() }],
          },
          bridgeUrl,
          ...faultPayload,
        });
        const err = (res as { error?: { message?: string } }).error;
        setLastResult(
          err
            ? { error: err.message, raw: res }
            : { sessionId: sessionId.trim(), raw: res }
        );
      } else {
        const res = await sendPlaygroundPrompt({
          prompt: prompt.trim(),
          sessionId: sessionId.trim() || undefined,
          bridgeUrl,
          ...faultPayload,
        });
        if (res.error) {
          setLastResult({ error: res.error.message, raw: res });
        } else {
          const sid = res.result?.sessionId;
          setLastResult({ sessionId: sid, raw: res });
          if (sid && !sessionId.trim()) setSessionId(sid);
        }
      }
      loadFrames();
    } catch (err) {
      setLastResult({ error: err instanceof Error ? err.message : "Request failed" });
    } finally {
      setSending(false);
    }
  };

  const handleSetBackend = async () => {
    if (!backendOverride.trim()) return;
    try {
      await setRoutingBackend(backendOverride.trim());
    } catch {
      // ignore
    }
  };

  const handleKill = async () => {
    if (!sessionId) return;
    setKilling(true);
    try {
      const ok = await killSession(sessionId);
      if (ok) setLastResult({ sessionId, error: "Session killed" });
    } finally {
      setKilling(false);
    }
  };

  const handleCancel = async () => {
    if (!sessionId) return;
    setCancelling(true);
    try {
      await sendPlaygroundRpc({
        method: "cancel",
        params: { sessionId },
        bridgeUrl,
      });
      setLastResult({ sessionId, raw: { result: "cancel sent" } });
    } catch (err) {
      setLastResult({ error: err instanceof Error ? err.message : "Cancel failed" });
    } finally {
      setCancelling(false);
    }
  };

  const handleApproveAll = async () => {
    for (const a of sessionApprovals) {
      await resolve(a.sessionId, a.toolCallId, "approve");
    }
    refreshApprovals();
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
        <h1 className="text-2xl font-semibold text-zinc-100">Playground</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Test translation and routing: choose dialect, send messages, watch frames and tool calls. No external client.
        </p>
      </div>

      {/* Session + dialect */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2">
          <Layers className="h-4 w-4" />
          Session
        </h2>
        <div className="flex flex-wrap gap-4 items-center">
          <div className="flex gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="dialect"
                checked={dialect === "copilot"}
                onChange={() => setDialect("copilot")}
                className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/50"
              />
              <span className="text-sm text-zinc-300">Copilot JSON-RPC</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="dialect"
                checked={dialect === "acp"}
                onChange={() => setDialect("acp")}
                className="rounded border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-emerald-500/50"
              />
              <span className="text-sm text-zinc-300">ACP</span>
            </label>
          </div>
          {dialect === "acp" && (
            <button
              type="button"
              onClick={handleNewAcpSession}
              disabled={sending}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-700 text-zinc-200 text-sm hover:bg-zinc-600 disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              New ACP session
            </button>
          )}
          <div className="flex items-center gap-2">
            <label className="text-sm text-zinc-500">Session ID</label>
            <input
              type="text"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              placeholder="leave empty for new (Copilot)"
              className="w-56 rounded border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-zinc-100 text-sm font-mono placeholder-zinc-500"
            />
          </div>
        </div>
      </section>

      {/* Backend */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 space-y-3">
        <h2 className="text-sm font-semibold text-zinc-300">Backend</h2>
        <p className="text-xs text-zinc-500">
          Current: <code className="text-zinc-400">{currentBackend}</code>. Bridge uses backend from process startup; routing rule below is for reference.
        </p>
        <div className="flex flex-wrap gap-2 items-center">
          {COMMON_BACKENDS.map((b) => (
            <button
              key={b}
              type="button"
              onClick={() => setBackendOverride(b)}
              className="px-2 py-1 rounded text-xs font-mono bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-zinc-200"
            >
              {b.split(":")[0]}
            </button>
          ))}
          <input
            type="text"
            value={backendOverride}
            onChange={(e) => setBackendOverride(e.target.value)}
            placeholder="acp:cmd or openai-compat:url"
            className="flex-1 min-w-[200px] rounded border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-zinc-100 text-sm font-mono"
          />
          <button
            type="button"
            onClick={handleSetBackend}
            className="px-3 py-1.5 rounded bg-emerald-500/20 text-emerald-400 text-sm hover:bg-emerald-500/30"
          >
            Set routing rule
          </button>
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
          placeholder="e.g. What is 2+2?"
          rows={3}
          className="w-full rounded-lg border border-zinc-700 bg-zinc-900/80 px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:border-emerald-500/50 focus:outline-none focus:ring-1 focus:ring-emerald-500/30 resize-y font-mono text-sm"
          disabled={sending}
        />
        <div className="flex items-center justify-between flex-wrap gap-2">
          <span className="text-xs text-zinc-500 font-mono">Bridge: {bridgeUrl}</span>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !prompt.trim()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 disabled:opacity-50 font-medium text-sm"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
        {lastResult && (
          <div
            className={`rounded-lg border p-4 ${
              lastResult.error
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-emerald-500/20 bg-emerald-500/5"
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
                <CheckCircle className="h-5 w-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-emerald-200">OK</p>
                  {lastResult.sessionId && (
                    <Link
                      to={`/sessions/${lastResult.sessionId}`}
                      className="mt-1 inline-flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300"
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

      {/* Live frame viewer */}
      {sessionId && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <button
            type="button"
            onClick={() => setFramesOpen((o) => !o)}
            className="w-full flex items-center justify-between text-sm font-semibold text-zinc-300"
          >
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Live frames (raw JSON-RPC)
            </span>
            {framesOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
          {framesOpen && (
            <div className="mt-3 space-y-2 max-h-64 overflow-auto">
              {frames.length === 0 ? (
                <p className="text-xs text-zinc-500">No frames yet.</p>
              ) : (
                frames.map((f) => (
                  <details key={f.id} className="rounded border border-zinc-700 bg-zinc-900/60">
                    <summary className="px-3 py-2 text-xs font-mono text-zinc-400 cursor-pointer hover:bg-zinc-800/50">
                      {f.type} @ {new Date(f.timestamp).toISOString()}
                    </summary>
                    <pre className="p-3 text-xs text-zinc-500 overflow-auto whitespace-pre-wrap">
                      {JSON.stringify(f.payload, null, 2)}
                    </pre>
                  </details>
                ))
              )}
            </div>
          )}
        </section>
      )}

      {/* Tool-call panel */}
      {sessionId && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
          <h2 className="text-sm font-semibold text-zinc-300 flex items-center gap-2 mb-3">
            <ShieldCheck className="h-4 w-4 text-amber-400/80" />
            Tool calls (this session)
          </h2>
          {sessionApprovals.length === 0 ? (
            <p className="text-xs text-zinc-500">No pending approvals.</p>
          ) : (
            <div className="space-y-2">
              {sessionApprovals.length > 1 && (
                <button
                  type="button"
                  onClick={handleApproveAll}
                  className="text-xs text-emerald-400 hover:text-emerald-300"
                >
                  Approve all ({sessionApprovals.length})
                </button>
              )}
              {sessionApprovals.map((a) => (
                <div
                  key={a.key}
                  className="flex items-center justify-between gap-2 rounded-lg border border-zinc-700 bg-zinc-900/60 p-2"
                >
                  <code className="text-xs font-mono text-zinc-400 truncate flex-1">
                    {a.command ?? a.toolCallId}
                  </code>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => resolve(a.sessionId, a.toolCallId, "approve")}
                      className="px-2 py-1 rounded text-xs bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => resolve(a.sessionId, a.toolCallId, "deny")}
                      className="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 hover:bg-red-500/30"
                    >
                      Deny
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

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
            className="inline-flex items-center gap-2 text-sm text-emerald-400 hover:text-emerald-300"
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

      {/* Kill / Cancel */}
      {sessionId && (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleKill}
            disabled={killing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 disabled:opacity-50 text-sm font-medium"
          >
            {killing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Skull className="h-4 w-4" />}
            Kill session
          </button>
          <button
            type="button"
            onClick={handleCancel}
            disabled={cancelling}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-600/50 text-zinc-300 border border-zinc-600 hover:bg-zinc-600 disabled:opacity-50 text-sm font-medium"
          >
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
            Cancel
          </button>
        </section>
      )}

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
            <input
              type="checkbox"
              checked={faultDrop}
              onChange={(e) => setFaultDrop(e.target.checked)}
              className="rounded border-zinc-600 bg-zinc-800 text-amber-500"
            />
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
          Or open <Link to="/sessions" className="text-emerald-400/90 hover:text-emerald-400">Sessions</Link> to see live activity.
        </p>
      </section>
    </div>
  );
}
