import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Skull,
  FileJson,
  Copy,
  Check,
  Shield,
  Wrench,
  Download,
  Play,
  Trash2,
} from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import { Tabs } from "@base-ui/react/tabs";
import { useSession } from "@/lib/useApi";
import { formatTime, formatDuration, truncateId } from "@/lib/format";
import { getSessionExportUrl } from "@/lib/api";
import type { Frame } from "@/lib/api";

function getFilterCategory(type: string): "messages" | "tools" | "routing" | "safety" | "errors" | null {
  if (type.includes("prompt") || type.includes("openai.prompt")) return "messages";
  if (type.includes("request_permission") || type.includes("tool_call")) return "tools";
  if (type.includes("session/new") || type.includes("routing")) return "routing";
  if (type.includes("request_permission")) return "safety";
  if (type.includes("cancel") || type.includes("kill") || type.includes("error")) return "errors";
  return null;
}

function extractToolCalls(frames: Frame[]): Array<{ id: string; command?: string; status?: string; result?: unknown; timestamp: number }> {
  const tools: Array<{ id: string; command?: string; status?: string; result?: unknown; timestamp: number }> = [];
  for (const f of frames) {
    if (f.type === "tool_call" || f.type === "tool_call_update" || (f.payload && typeof f.payload === "object" && "toolCallId" in (f.payload as object))) {
      const p = f.payload as Record<string, unknown>;
      const id = (p?.toolCallId ?? f.id) as string;
      const existing = tools.find((t) => t.id === id);
      const entry = existing ?? { id, timestamp: f.timestamp };
      if (p?.name) entry.command = String(p.name);
      if (p?.command) entry.command = String(p.command);
      if (p?.status) entry.status = String(p.status);
      if (p?.result !== undefined) entry.result = p.result;
      if (!existing) tools.push(entry);
      else Object.assign(existing, entry);
    }
  }
  return tools.sort((a, b) => a.timestamp - b.timestamp);
}

function sessionDuration(frames: Frame[]): number {
  if (frames.length < 2) return 0;
  const first = frames[0].timestamp;
  const last = frames[frames.length - 1].timestamp;
  return last - first;
}

function sessionTokens(frames: Frame[]): number {
  let n = 0;
  for (const f of frames) {
    const p = (f.payload || {}) as Record<string, unknown>;
    const text = (p.text ?? p.delta ?? p.result ?? "") as string;
    if (typeof text === "string") n += text.length;
  }
  return n;
}

function KillButton({
  onKill,
  disabled,
}: {
  onKill: () => Promise<boolean>;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [killing, setKilling] = useState(false);

  const handleConfirm = useCallback(async () => {
    setKilling(true);
    try {
      const ok = await onKill();
      if (ok) setOpen(false);
    } finally {
      setKilling(false);
    }
  }, [onKill]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-50 font-medium text-sm"
      >
        <Skull className="h-4 w-4" />
        Kill
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => !killing && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Kill this session?</h3>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">This will immediately terminate the session.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => !killing && setOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={killing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/40 disabled:opacity-50 font-medium text-sm"
              >
                {killing ? "Killing…" : "Kill session"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Terminal-style log line: datetime [Bridge.stderr] (dimmed) + pretty-printed JSON */
function ConsoleFrameLine({
  timestamp,
  type,
  payload,
  redacted,
}: {
  timestamp: number;
  type: string;
  payload: unknown;
  redacted?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const datetime = new Date(timestamp).toISOString();
  const json = JSON.stringify({ type, payload }, null, 2);

  const handleCopy = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    [json]
  );

  return (
    <div className="flex items-start gap-2 border-b border-zinc-300 dark:border-zinc-800/80 px-3 py-1.5 last:border-b-0 hover:bg-zinc-100 dark:hover:bg-zinc-800/20 group font-mono text-xs">
      <span className="text-zinc-500 dark:text-zinc-500 shrink-0 select-none">
        {datetime}
      </span>
      <pre className="text-[11px] text-zinc-600 dark:text-zinc-400 overflow-x-auto whitespace-pre-wrap break-words flex-1 min-w-0">
        {json}
      </pre>
      {redacted && (
        <span className="shrink-0 inline-flex items-center gap-1 text-amber-400/80 text-[10px]">
          <Shield className="h-3 w-3" />
          redacted
        </span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        className="text-zinc-500 hover:text-sky-600 dark:hover:text-sky-400 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-sky-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, frames, loading, error, killSession, deleteSession } = useSession(id);
  const [timelineFilter, setTimelineFilter] = useState<"all" | "messages" | "tools" | "routing" | "safety" | "errors">("all");
  const [linkCopied, setLinkCopied] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const filteredFrames = useMemo(() => {
    if (timelineFilter === "all") return frames;
    return frames.filter((f) => getFilterCategory(f.type) === timelineFilter);
  }, [frames, timelineFilter]);

  const duration = useMemo(() => sessionDuration(frames), [frames]);
  const tokens = useMemo(() => sessionTokens(frames), [frames]);
  const client = useMemo(() => {
    const hasCopilot = frames.some((f) => f.type.startsWith("copilot."));
    return hasCopilot ? "Copilot" : "ACP";
  }, [frames]);

  const copySessionLink = useCallback(async () => {
    if (!id) return;
    await navigator.clipboard.writeText(`${window.location.origin}/sessions/${id}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [id]);

  const handleDeleteConfirm = useCallback(async () => {
    if (!id) return;
    setDeleting(true);
    try {
      const ok = await deleteSession();
      if (ok) {
        setDeleteConfirmOpen(false);
        navigate("/sessions");
      }
    } finally {
      setDeleting(false);
    }
  }, [id, deleteSession, navigate]);

  if (loading && !session) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 h-8 w-32 rounded bg-zinc-300 dark:bg-zinc-800 animate-pulse" />
        <div className="rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-6 mb-6 animate-pulse">
          <div className="h-5 w-2/3 rounded bg-zinc-300 dark:bg-zinc-700/50" />
          <div className="mt-3 h-4 w-1/2 rounded bg-zinc-300/80 dark:bg-zinc-700/40" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 rounded bg-zinc-300 dark:bg-zinc-700/50" />
                <div className="h-4 flex-1 max-w-[120px] rounded bg-zinc-300/80 dark:bg-zinc-700/40" />
                <div className="h-4 w-16 rounded bg-zinc-300/80 dark:bg-zinc-700/40" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="max-w-md mx-auto py-16">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-8 text-center">
          <p className="text-zinc-400">{error ?? "Session not found"}</p>
          <button
            onClick={() => navigate("/sessions")}
            className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-300 text-sm font-medium"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to sessions
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-4 mb-4">
        <button
          onClick={() => navigate("/sessions")}
          className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 font-medium text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      <Tabs.Root defaultValue="console" className="space-y-0">
        <Tabs.List className="flex gap-2 border-b border-zinc-300 dark:border-zinc-800 pb-2 mb-4">
          <Tabs.Tab
            value="console"
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 data-[selected]:bg-zinc-200 data-[selected]:text-zinc-900 dark:data-[selected]:bg-zinc-800 dark:data-[selected]:text-zinc-100"
          >
            <FileJson className="h-4 w-4 inline mr-2" />
            Console ({frames.length})
          </Tabs.Tab>
          <Tabs.Tab
            value="tools"
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 data-[selected]:bg-zinc-200 data-[selected]:text-zinc-900 dark:data-[selected]:bg-zinc-800 dark:data-[selected]:text-zinc-100"
          >
            <Wrench className="h-4 w-4 inline mr-2" />
            Tool calls ({extractToolCalls(frames).length})
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="console" className="space-y-4">
          {/* Sticky header */}
          <div className="sticky top-0 z-10 -mx-6 px-6 py-4 bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-300 dark:border-zinc-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <code className="font-mono text-sm text-zinc-800 dark:text-zinc-200">{truncateId(session.id, 24)}</code>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">{client}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">Agent: —</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">{formatDuration(duration) || "—"}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">{tokens} chars</span>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium shrink-0 ${session.status === "active"
                  ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                  : session.status === "killed"
                    ? "bg-red-500/15 text-red-400 border border-red-500/30"
                    : "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30"
                  }`}
              >
                {session.status === "active" && <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />}
                {session.status}
              </span>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">Filters</span>
                {(["all", "messages", "tools", "routing", "safety", "errors"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTimelineFilter(value)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium ${timelineFilter === value
                      ? "bg-zinc-300 dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100"
                      : "bg-zinc-100 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
                      }`}
                  >
                    {value === "all" ? "All" : value.charAt(0).toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {session.status === "active" && <KillButton onKill={killSession} disabled={false} />}
                <button
                  type="button"
                  onClick={() => id && navigate(`/playground?loadSessionId=${encodeURIComponent(id)}`)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-sky-400/90 hover:text-sky-400 hover:bg-sky-500/10 border border-sky-500/20"
                  title="Load this session in Playground"
                >
                  <Play className="h-4 w-4" />
                  Open in Playground
                </button>
                <a
                  href={id ? getSessionExportUrl(id) : "#"}
                  download
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                >
                  <Download className="h-4 w-4" />
                  Export
                </a>
                <button
                  type="button"
                  onClick={copySessionLink}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                >
                  {linkCopied ? <Check className="h-4 w-4 text-sky-400" /> : <Copy className="h-4 w-4" />}
                  Copy link
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteConfirmOpen(true)}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20"
                  title="Delete this session"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          </div>

          {deleteConfirmOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              onClick={() => !deleting && setDeleteConfirmOpen(false)}
            >
              <div
                className="w-full max-w-md rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Delete this session?</h3>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  This will permanently remove the session and all its frames. This cannot be undone.
                </p>
                <div className="mt-6 flex justify-end gap-3">
                  <button
                    onClick={() => !deleting && setDeleteConfirmOpen(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteConfirm}
                    disabled={deleting}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 disabled:opacity-50 font-medium text-sm"
                  >
                    {deleting ? "Deleting…" : "Delete session"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Console: terminal-style frames */}
          <div className="rounded border border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 font-mono text-xs text-zinc-700 dark:text-zinc-300">
            {filteredFrames.length === 0 ? (
              <div className="p-12 text-center text-zinc-500 dark:text-zinc-500">
                <FileJson className="h-12 w-12 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
                <p>No log entries</p>
                <p className="mt-1 text-zinc-600 dark:text-zinc-600">Frames will appear as the session runs</p>
              </div>
            ) : (
              <div>
                {filteredFrames.map((f) => (
                  <ConsoleFrameLine
                    key={f.id}
                    timestamp={f.timestamp}
                    type={f.type}
                    payload={f.payload}
                    redacted={f.redacted}
                  />
                ))}
              </div>
            )}
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="tools" className="space-y-2">
          {(() => {
            const toolCalls = extractToolCalls(frames);
            return toolCalls.length === 0 ? (
              <div className="rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 p-12 text-center">
                <Wrench className="h-12 w-12 text-zinc-400 dark:text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-600 dark:text-zinc-500">No tool calls</p>
              </div>
            ) : (
              <div className="space-y-2">
                {toolCalls.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <code className="text-sm font-mono text-sky-600 dark:text-sky-400">{t.command ?? t.id}</code>
                      {t.status && <span className="text-xs text-zinc-500 dark:text-zinc-500">{t.status}</span>}
                    </div>
                    {t.result !== undefined && (
                      <pre className="mt-2 font-mono text-xs text-zinc-600 dark:text-zinc-400 overflow-x-auto whitespace-pre-wrap break-words">
                        {typeof t.result === "string" ? t.result : JSON.stringify(t.result, null, 2)}
                      </pre>
                    )}
                    <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-600">{formatTime(t.timestamp)}</p>
                  </div>
                ))}
              </div>
            );
          })()}
        </Tabs.Panel>
      </Tabs.Root>
    </div>
  );
}
