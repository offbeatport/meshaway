import { Link } from "react-router-dom";
import {
  Activity,
  Clock,
  Layers,
  Terminal,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { useState } from "react";
import { useSessions, useHealth } from "@/lib/useApi";
import { useApprovals } from "@/lib/useApi";
import { formatRelativeTime, truncateId } from "@/lib/format";
import { SkeletonCard } from "@/components/SkeletonCard";
import { CopyBridgeUrl } from "@/components/CopyBridgeUrl";

const BRIDGE_URL = "http://127.0.0.1:4321";

function StatusBadge({ status }: { status: string }) {
  const styles = {
    active: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    killed: "bg-red-500/15 text-red-400 border-red-500/30",
    completed: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
  };
  const style = styles[status as keyof typeof styles] ?? styles.completed;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${style}`}
    >
      {status === "active" && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse" />
      )}
      {status}
    </span>
  );
}

function SessionCard({
  id,
  status,
  updatedAt,
  frameCount,
}: {
  id: string;
  status: string;
  updatedAt: number;
  frameCount: number;
}) {
  return (
    <Link
      to={`/sessions/${id}`}
      className="group block rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <code className="block font-mono text-sm text-zinc-300 truncate group-hover:text-emerald-400/90 transition-colors">
            {truncateId(id, 24)}
          </code>
          <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />
              {formatRelativeTime(updatedAt)}
            </span>
            <span className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" />
              {frameCount} frame{frameCount !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>
    </Link>
  );
}

export function HubHome() {
  const { sessions, loading } = useSessions(4000);
  const healthy = useHealth();
  const { approvals, loading: approvalsLoading, resolve } = useApprovals(3000);

  const activeSessions = sessions.filter((s) => s.status === "active");
  const recentSessions = sessions
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);

  const statusLine =
    healthy === true
      ? `${activeSessions.length} active session${activeSessions.length !== 1 ? "s" : ""} · Bridge ready`
      : healthy === false
        ? "Offline · Check connection"
        : "Connecting…";

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-100">Meshaway Hub</h1>
        <p className="mt-1 text-sm text-zinc-500">{statusLine}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-zinc-200 flex items-center gap-2">
              <Activity className="h-5 w-5 text-emerald-400/80" />
              Active sessions
            </h2>
            <Link
              to="/sessions"
              className="text-sm text-emerald-400/90 hover:text-emerald-400 transition-colors"
            >
              View all →
            </Link>
          </div>

          {loading && sessions.length === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {[1, 2, 3].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : recentSessions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-12 text-center">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-800/50 mb-4">
                <Terminal className="h-7 w-7 text-zinc-600" />
              </div>
              <h3 className="text-base font-medium text-zinc-300">
                No sessions yet
              </h3>
              <p className="mt-3 text-sm text-zinc-500 max-w-sm mx-auto text-left">
                <span className="block mb-2">Get started in 3 steps:</span>
                <span className="block">1. Run <code className="text-zinc-400">npx meshaway</code></span>
                <span className="block">2. Set Copilot <code className="text-zinc-400">cliUrl = http://127.0.0.1:4321</code></span>
                <span className="block">3. Start a task — session appears here</span>
              </p>
              <CopyBridgeUrl className="mt-4" />
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {recentSessions.map((s) => (
                <SessionCard
                  key={s.id}
                  id={s.id}
                  status={s.status}
                  updatedAt={s.updatedAt}
                  frameCount={s.frames?.length ?? 0}
                />
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <h2 className="text-lg font-medium text-zinc-200 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-amber-400/80" />
            Pending approvals
          </h2>
          {approvalsLoading && approvals.length === 0 ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div
                  key={i}
                  className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 animate-pulse"
                >
                  <div className="h-4 w-3/4 rounded bg-zinc-700/40" />
                  <div className="mt-2 h-3 w-1/2 rounded bg-zinc-700/30" />
                </div>
              ))}
            </div>
          ) : approvals.length === 0 ? (
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6 text-center">
              <p className="text-sm text-zinc-500">All clear — no pending approvals</p>
              <Link
                to="/approvals"
                className="mt-2 inline-block text-xs text-emerald-400/90 hover:text-emerald-400"
              >
                View approvals →
              </Link>
            </div>
          ) : (
            <div className="space-y-2">
              {approvals.slice(0, 3).map((a) => (
                <ApprovalRow key={a.key} approval={a} onResolve={resolve} />
              ))}
              {approvals.length > 3 && (
                <Link
                  to="/approvals"
                  className="block text-center text-sm text-zinc-500 hover:text-zinc-300 py-2"
                >
                  +{approvals.length - 3} more →
                </Link>
              )}
            </div>
          )}

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-4">
            <h3 className="text-sm font-medium text-zinc-300 mb-2">
              Quick connect
            </h3>
            <CopyBridgeUrl className="mt-0" />
            <a
              href={BRIDGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Open Bridge URL
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function ApprovalRow({
  approval,
  onResolve,
}: {
  approval: { key: string; sessionId: string; toolCallId: string; command?: string };
  onResolve: (sessionId: string, toolCallId: string, decision: "approve" | "deny") => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    try {
      await onResolve(approval.sessionId, approval.toolCallId, "approve");
    } finally {
      setLoading(false);
    }
  };

  const handleDeny = async () => {
    setLoading(true);
    try {
      await onResolve(approval.sessionId, approval.toolCallId, "deny");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <code className="text-xs font-mono text-zinc-400 truncate block">
            {approval.command ?? approval.toolCallId}
          </code>
          <Link
            to={`/sessions/${approval.sessionId}`}
            className="text-xs text-emerald-400/90 hover:text-emerald-400 mt-0.5"
          >
            Session →
          </Link>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={handleApprove}
            disabled={loading}
            className="px-2 py-1 rounded text-xs font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 disabled:opacity-50"
          >
            Approve
          </button>
          <button
            onClick={handleDeny}
            disabled={loading}
            className="px-2 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 disabled:opacity-50"
          >
            Deny
          </button>
        </div>
      </div>
    </div>
  );
}
