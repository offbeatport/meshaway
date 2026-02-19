import { Link } from "react-router-dom";
import {
  Activity,
  Clock,
  Layers,
  RefreshCw,
  Terminal,
  AlertCircle,
} from "lucide-react";
import { useSessions } from "@/lib/useApi";
import { formatRelativeTime, truncateId } from "@/lib/format";
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
      className="group block rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-200 animate-fade-in"
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

export function SessionsList() {
  const { sessions, loading, error, refresh } = useSessions(4000);

  if (loading && sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="w-12 h-12 rounded-xl bg-zinc-800/80 flex items-center justify-center animate-pulse-subtle">
          <Activity className="h-6 w-6 text-zinc-500" />
        </div>
        <p className="mt-4 text-zinc-500 font-medium">Loading sessions…</p>
        <p className="mt-1 text-sm text-zinc-600">Connecting to Hub</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto py-16">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-amber-200">Connection error</h3>
              <p className="mt-1 text-sm text-zinc-400">{error}</p>
              <button
                onClick={refresh}
                className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <Activity className="h-5 w-5 text-emerald-400/80" />
            Sessions
          </h2>
          <p className="mt-1 text-sm text-zinc-500">
            Active and recent agent sessions
          </p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 transition-colors"
          title="Refresh"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-16 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-zinc-800/50 mb-4">
            <Terminal className="h-8 w-8 text-zinc-600" />
          </div>
          <h3 className="text-lg font-medium text-zinc-300">
            No sessions yet
          </h3>
          <p className="mt-2 text-zinc-500 max-w-sm mx-auto">
            Connect a client to the Bridge to start. Point Copilot SDK{" "}
            <code className="text-zinc-400">cliUrl</code> to{" "}
            <code className="text-emerald-400/80">http://127.0.0.1:4321</code>
          </p>
          <p className="mt-4 text-xs text-zinc-600 font-mono">
            Sessions will appear here when clients connect
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((s) => (
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
  );
}
