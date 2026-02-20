import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Skull,
  FileJson,
  Copy,
  Check,
  ChevronRight,
  Shield,
  Wrench,
  MessageSquare,
  Route,
  XCircle,
  Download,
  Clock,
} from "lucide-react";
import { useState, useCallback, useMemo } from "react";
import { Checkbox } from "@base-ui/react/checkbox";
import { Collapsible } from "@base-ui/react/collapsible";
import { Tabs } from "@base-ui/react/tabs";
import { useSession } from "@/lib/useApi";
import { formatDateTime, formatTime, formatDuration, truncateId } from "@/lib/format";
import { getSessionExportUrl } from "@/lib/api";
import type { Frame } from "@/lib/api";

type EventKind = "model" | "user" | "approval" | "error" | "routing";
const EVENT_COLORS: Record<EventKind, string> = {
  model: "bg-teal-500",
  user: "bg-sky-500",
  approval: "bg-amber-500",
  error: "bg-red-500",
  routing: "bg-zinc-500",
};

function getEventKind(type: string): EventKind {
  if (type.includes("prompt.result") || type.includes("openai.prompt")) return "model";
  if (type.includes("request_permission")) return "approval";
  if (type.includes("cancel") || type.includes("kill") || type.includes("error")) return "error";
  if (type.includes("session/new") || type.includes("routing")) return "routing";
  return "user";
}

function getFilterCategory(type: string): "messages" | "tools" | "routing" | "safety" | "errors" | null {
  if (type.includes("prompt") || type.includes("openai.prompt")) return "messages";
  if (type.includes("request_permission") || type.includes("tool_call")) return "tools";
  if (type.includes("session/new") || type.includes("routing")) return "routing";
  if (type.includes("request_permission")) return "safety";
  if (type.includes("cancel") || type.includes("kill") || type.includes("error")) return "errors";
  return null;
}

function eventSummary(frame: Frame): string {
  const type = frame.type;
  const p = (frame.payload || {}) as Record<string, unknown>;
  if (type === "copilot.prompt") {
    const prompt = typeof p.prompt === "string" ? p.prompt : "";
    return prompt.slice(0, 120) + (prompt.length > 120 ? "…" : "") || "User message";
  }
  if (type === "acp.session/new") return "Session started";
  if (type === "acp.session/prompt") return "User / tool input";
  if (type === "acp.session/prompt.result" || type === "openai.prompt.result") {
    const text = (p.text ?? p.result ?? "") as string;
    const len = typeof text === "string" ? text.length : 0;
    return `Response${len ? ` (${len} chars)` : ""}`;
  }
  if (type === "acp.session/request_permission") return "Waiting for approval";
  if (type === "acp.session/cancel") return "Cancel / kill";
  return type;
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
            className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-zinc-100">Kill this session?</h3>
            <p className="mt-1 text-sm text-zinc-400">This will immediately terminate the session.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => !killing && setOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
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

function TimelineEventCard({ frame }: { frame: Frame }) {
  const [open, setOpen] = useState(false);
  const [jsonOpen, setJsonOpen] = useState(false);
  const kind = getEventKind(frame.type);
  const summary = eventSummary(frame);
  const json = JSON.stringify(frame.payload, null, 2);

  const Icon =
    kind === "model"
      ? MessageSquare
      : kind === "user"
        ? MessageSquare
        : kind === "approval"
          ? Shield
          : kind === "error"
            ? XCircle
            : Route;

  return (
    <div className="flex gap-0 rounded-lg border border-zinc-700 dark:border-zinc-800 bg-zinc-800/30 dark:bg-zinc-900/40 overflow-hidden">
      <div className={`w-1 flex-shrink-0 ${EVENT_COLORS[kind]}`} />
      <div className="flex flex-col items-center w-20 flex-shrink-0 py-2 border-r border-zinc-700 dark:border-zinc-800">
        <span className="text-xs text-zinc-500 dark:text-zinc-500 font-mono">
          {formatTime(frame.timestamp)}
        </span>
        <Icon className="h-4 w-4 mt-1 text-zinc-400 dark:text-zinc-500" />
      </div>
      <Collapsible.Root open={open} onOpenChange={setOpen} className="flex-1 min-w-0">
        <Collapsible.Trigger className="flex w-full items-start justify-between gap-4 p-3 text-left hover:bg-zinc-800/50 dark:hover:bg-zinc-800/30 cursor-pointer">
          <p className="text-sm text-zinc-200 dark:text-zinc-200 truncate flex-1">{summary}</p>
          <ChevronRight
            className={`h-4 w-4 text-zinc-500 flex-shrink-0 ${open ? "rotate-90" : ""}`}
          />
        </Collapsible.Trigger>
        <Collapsible.Panel>
          <div className="border-t border-zinc-700 dark:border-zinc-800 px-3 py-2 space-y-2 bg-zinc-900/30 dark:bg-zinc-950/50">
            {typeof frame.payload === "object" && frame.payload && (
              <pre className="font-mono text-xs text-zinc-400 dark:text-zinc-500 overflow-x-auto whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
                {JSON.stringify(frame.payload, null, 2)}
              </pre>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setJsonOpen((o) => !o); }}
              className="text-xs text-zinc-500 dark:text-zinc-500 hover:text-zinc-300 dark:hover:text-zinc-300"
            >
              {jsonOpen ? "Hide" : "Show"} raw JSON
            </button>
            {jsonOpen && (
              <pre className="font-mono text-xs text-zinc-500 dark:text-zinc-600 overflow-x-auto whitespace-pre-wrap break-words">
                {json}
              </pre>
            )}
          </div>
        </Collapsible.Panel>
      </Collapsible.Root>
    </div>
  );
}

function FrameCard({
  type,
  timestamp,
  payload,
  redacted,
}: {
  type: string;
  timestamp: number;
  payload: unknown;
  redacted?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(payload, null, 2);

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
    <Collapsible.Root open={open} onOpenChange={setOpen} className="rounded-lg border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <Collapsible.Trigger className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-zinc-800/30 cursor-pointer">
        <div className="flex items-center gap-3 min-w-0">
          <ChevronRight
            className={`h-4 w-4 text-zinc-500 flex-shrink-0 ${open ? "rotate-90" : ""}`}
          />
          <span className="font-mono text-sm text-sky-400">{type}</span>
          <span className="text-xs text-zinc-500">
            {formatTime(timestamp)}
            {redacted && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-400/80">
                <Shield className="h-3 w-3" />
                redacted
              </span>
            )}
          </span>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-2 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 flex-shrink-0"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-sky-400" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </Collapsible.Trigger>
      <Collapsible.Panel>
        <div className="border-t border-zinc-800 px-4 py-3 bg-zinc-950/50">
          <pre className="font-mono text-xs text-zinc-400 overflow-x-auto whitespace-pre-wrap break-words">
            {json}
          </pre>
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}

export function SessionDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session, frames, loading, error, killSession } = useSession(id);
  const [timelineFilter, setTimelineFilter] = useState<"all" | "messages" | "tools" | "routing" | "safety" | "errors">("all");
  const [rawFrames, setRawFrames] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

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

  if (loading && !session) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="mb-6 h-8 w-32 rounded bg-zinc-800 animate-pulse" />
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 mb-6 animate-pulse">
          <div className="h-5 w-2/3 rounded bg-zinc-700/50" />
          <div className="mt-3 h-4 w-1/2 rounded bg-zinc-700/40" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="h-4 w-4 rounded bg-zinc-700/50" />
                <div className="h-4 flex-1 max-w-[120px] rounded bg-zinc-700/40" />
                <div className="h-4 w-16 rounded bg-zinc-700/40" />
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
            className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium"
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
          className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 font-medium text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
      </div>

      <Tabs.Root defaultValue="timeline" className="space-y-0">
        <Tabs.List className="flex gap-2 border-b border-zinc-800 pb-2 mb-4">
          <Tabs.Tab
            value="timeline"
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 data-[selected]:bg-zinc-800 data-[selected]:text-zinc-100"
          >
            <Clock className="h-4 w-4 inline mr-2" />
            Timeline
          </Tabs.Tab>
          <Tabs.Tab
            value="frames"
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 data-[selected]:bg-zinc-800 data-[selected]:text-zinc-100"
          >
            <FileJson className="h-4 w-4 inline mr-2" />
            Frames ({frames.length})
          </Tabs.Tab>
          <Tabs.Tab
            value="tools"
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 data-[selected]:bg-zinc-800 data-[selected]:text-zinc-100"
          >
            <Wrench className="h-4 w-4 inline mr-2" />
            Tool calls ({extractToolCalls(frames).length})
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="timeline" className="space-y-4">
          {/* Sticky header */}
          <div className="sticky top-0 z-10 -mx-6 px-6 py-4 bg-zinc-950 dark:bg-zinc-950 border-b border-zinc-800 space-y-3">
            {/* Row 1: session id + meta (left), status (right) */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <code className="font-mono text-sm text-zinc-200 dark:text-zinc-200">{truncateId(session.id, 24)}</code>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">{client}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">Backend: —</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">{formatDuration(duration) || "—"}</span>
                <span className="text-xs text-zinc-500 dark:text-zinc-500">{tokens} chars</span>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium shrink-0 ${
                  session.status === "active"
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
            {/* Row 2: filters (left), actions (right) */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-500 uppercase tracking-wider">Filters</span>
                {(["all", "messages", "tools", "routing", "safety", "errors"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTimelineFilter(value)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium ${
                      timelineFilter === value
                        ? "bg-zinc-700 dark:bg-zinc-700 text-zinc-100 dark:text-zinc-100"
                        : "bg-zinc-800/50 dark:bg-zinc-800/50 text-zinc-400 dark:text-zinc-400 hover:text-zinc-200 dark:hover:text-zinc-200"
                    }`}
                  >
                    {value === "all" ? "All" : value.charAt(0).toUpperCase() + value.slice(1)}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {session.status === "active" && <KillButton onKill={killSession} disabled={false} />}
                <a
                  href={id ? getSessionExportUrl(id) : "#"}
                  download
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                >
                  <Download className="h-4 w-4" />
                  Export
                </a>
                <button
                  type="button"
                  onClick={copySessionLink}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
                >
                  {linkCopied ? <Check className="h-4 w-4 text-sky-400" /> : <Copy className="h-4 w-4" />}
                  Copy link
                </button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-400 dark:text-zinc-500 cursor-pointer">
              <Checkbox.Root
                checked={rawFrames}
                onCheckedChange={(checked) => setRawFrames(!!checked)}
                className="size-4 rounded border border-zinc-600 bg-zinc-800 data-[checked]:bg-sky-500 data-[checked]:border-sky-500 flex items-center justify-center"
              >
                <Checkbox.Indicator className="text-white">
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="2,6 5,9 10,3" />
                  </svg>
                </Checkbox.Indicator>
              </Checkbox.Root>
              Raw frames
            </label>
          </div>

          {/* Timeline body */}
          <div className="space-y-2 pt-2">
            {filteredFrames.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-12 text-center">
                <Clock className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-500">No events</p>
                <p className="mt-1 text-sm text-zinc-600">Events will appear as the session runs</p>
              </div>
            ) : rawFrames ? (
              <div className="space-y-2">
                {filteredFrames.map((f) => (
                  <FrameCard
                    key={f.id}
                    type={f.type}
                    timestamp={f.timestamp}
                    payload={f.payload}
                    redacted={f.redacted}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredFrames.map((f) => (
                  <TimelineEventCard key={f.id} frame={f} />
                ))}
              </div>
            )}
          </div>
        </Tabs.Panel>

        <Tabs.Panel value="frames" className="space-y-2">
          {frames.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-12 text-center">
              <FileJson className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-500">No frames recorded</p>
            </div>
          ) : (
            <div className="space-y-2">
              {frames.map((f) => (
                <FrameCard
                  key={f.id}
                  type={f.type}
                  timestamp={f.timestamp}
                  payload={f.payload}
                  redacted={f.redacted}
                />
              ))}
            </div>
          )}
        </Tabs.Panel>

        <Tabs.Panel value="tools" className="space-y-2">
          {(() => {
            const toolCalls = extractToolCalls(frames);
            return toolCalls.length === 0 ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-12 text-center">
                <Wrench className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-500">No tool calls</p>
              </div>
            ) : (
              <div className="space-y-2">
                {toolCalls.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <code className="text-sm font-mono text-sky-400">{t.command ?? t.id}</code>
                      {t.status && <span className="text-xs text-zinc-500">{t.status}</span>}
                    </div>
                    {t.result !== undefined && (
                      <pre className="mt-2 font-mono text-xs text-zinc-400 overflow-x-auto whitespace-pre-wrap break-words">
                        {typeof t.result === "string" ? t.result : JSON.stringify(t.result, null, 2)}
                      </pre>
                    )}
                    <p className="mt-1 text-xs text-zinc-600">{formatTime(t.timestamp)}</p>
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
