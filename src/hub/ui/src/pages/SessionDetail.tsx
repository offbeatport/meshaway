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
} from "lucide-react";
import { useState, useCallback } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { Tabs } from "@base-ui/react/tabs";
import { useSession } from "@/lib/useApi";
import { formatDateTime, formatTime } from "@/lib/format";
import type { Frame } from "@/lib/api";

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
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 hover:border-red-500/40 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
      >
        <Skull className="h-4 w-4" />
        Kill session
      </button>
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => !killing && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-500/10">
                <Skull className="h-5 w-5 text-red-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">
                  Kill this session?
                </h3>
                <p className="mt-1 text-sm text-zinc-400">
                  This will immediately terminate the session. Any in-flight
                  requests will be cancelled.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => !killing && setOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={killing}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/40 hover:bg-red-500/30 disabled:opacity-50 transition-colors font-medium text-sm"
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
      <Collapsible.Trigger className="flex w-full items-center justify-between gap-4 p-4 text-left hover:bg-zinc-800/30 transition-colors cursor-pointer">
        <div className="flex items-center gap-3 min-w-0">
          <ChevronRight
            className={`h-4 w-4 text-zinc-500 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
          <span className="font-mono text-sm text-emerald-400">{type}</span>
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
          className="flex items-center gap-2 px-2 py-1 rounded text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors flex-shrink-0"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-emerald-400" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
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
            <div
              key={i}
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 animate-pulse"
            >
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
          <p className="text-zinc-400">
            {error ?? "Session not found"}
          </p>
          <button
            onClick={() => navigate("/sessions")}
            className="mt-4 flex items-center gap-2 mx-auto px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-medium transition-colors"
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
      <div className="flex items-center justify-between gap-4 mb-6">
        <button
          onClick={() => navigate("/sessions")}
          className="flex items-center gap-2 text-zinc-400 hover:text-zinc-200 transition-colors font-medium text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        {session.status === "active" && (
          <KillButton onKill={killSession} disabled={false} />
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <code className="font-mono text-lg text-zinc-200">{session.id}</code>
            <div className="mt-2 flex items-center gap-4 text-sm text-zinc-500">
              <span>
                Created {formatDateTime(session.createdAt)}
              </span>
              <span>·</span>
              <span>
                Updated {formatDateTime(session.updatedAt)}
              </span>
            </div>
          </div>
          <span
            className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${
              session.status === "active"
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                : session.status === "killed"
                  ? "bg-red-500/15 text-red-400 border border-red-500/30"
                  : "bg-zinc-500/15 text-zinc-400 border border-zinc-500/30"
            }`}
          >
            {session.status}
          </span>
        </div>
      </div>

      <Tabs.Root defaultValue="frames" className="space-y-4">
        <Tabs.List className="flex gap-2 border-b border-zinc-800 pb-2">
          <Tabs.Tab
            value="frames"
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 data-[selected]:bg-zinc-800 data-[selected]:text-zinc-100 transition-colors"
          >
            <FileJson className="h-4 w-4 inline mr-2" />
            Frames ({frames.length})
          </Tabs.Tab>
          <Tabs.Tab
            value="tools"
            className="px-4 py-2 rounded-lg text-sm font-medium text-zinc-400 hover:text-zinc-200 data-[selected]:bg-zinc-800 data-[selected]:text-zinc-100 transition-colors"
          >
            <Wrench className="h-4 w-4 inline mr-2" />
            Tool calls ({extractToolCalls(frames).length})
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="frames" className="space-y-2">
          {frames.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-12 text-center">
              <FileJson className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
              <p className="text-zinc-500">No frames recorded</p>
              <p className="mt-1 text-sm text-zinc-600">
                Frames will appear as the session processes requests
              </p>
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
                <p className="text-zinc-500">No tool calls extracted</p>
                <p className="mt-1 text-sm text-zinc-600">
                  Tool calls will appear when the session invokes tools
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {toolCalls.map((t) => (
                  <div
                    key={t.id}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <code className="text-sm font-mono text-emerald-400">
                        {t.command ?? t.id}
                      </code>
                      {t.status && (
                        <span className="text-xs text-zinc-500">{t.status}</span>
                      )}
                    </div>
                    {t.result !== undefined && (
                      <pre className="mt-2 font-mono text-xs text-zinc-400 overflow-x-auto whitespace-pre-wrap break-words">
                        {typeof t.result === "string"
                          ? t.result
                          : JSON.stringify(t.result, null, 2)}
                      </pre>
                    )}
                    <p className="mt-1 text-xs text-zinc-600">
                      {formatTime(t.timestamp)}
                    </p>
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
