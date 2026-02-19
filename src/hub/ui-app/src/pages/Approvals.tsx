import { useState } from "react";
import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { useApprovals } from "@/lib/useApi";

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
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <code className="text-sm font-mono text-zinc-300 block truncate">
          {approval.command ?? approval.toolCallId}
        </code>
        <Link
          to={`/sessions/${approval.sessionId}`}
          className="text-sm text-emerald-400/90 hover:text-emerald-400 mt-1 inline-block"
        >
          View session →
        </Link>
      </div>
      <div className="flex gap-2 flex-shrink-0">
        <button
          onClick={handleApprove}
          disabled={loading}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 disabled:opacity-50 transition-colors"
        >
          Approve
        </button>
        <button
          onClick={handleDeny}
          disabled={loading}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/30 disabled:opacity-50 transition-colors"
        >
          Deny
        </button>
      </div>
    </div>
  );
}

export function Approvals() {
  const { approvals, loading, resolve } = useApprovals(3000);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-amber-400/80" />
          Pending approvals
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {approvals.length} pending tool call{approvals.length !== 1 ? "s" : ""}
        </p>
      </div>

      {loading && approvals.length === 0 ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 animate-pulse"
            >
              <div className="h-4 w-2/3 rounded bg-zinc-700/40" />
              <div className="mt-2 h-3 w-1/3 rounded bg-zinc-700/30" />
            </div>
          ))}
        </div>
      ) : approvals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-16 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-800/50 mb-4">
            <ShieldCheck className="h-8 w-8 text-zinc-600" />
          </div>
          <h3 className="text-lg font-medium text-zinc-300">
            No pending approvals
          </h3>
          <p className="mt-2 text-zinc-500 max-w-sm mx-auto">
            All clear — no tool calls are waiting for approval. When a dangerous
            tool is requested, it will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <ApprovalRow key={a.key} approval={a} onResolve={resolve} />
          ))}
        </div>
      )}
    </div>
  );
}
