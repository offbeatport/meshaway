import { Link } from "react-router-dom";
import {
  Activity,
  Clock,
  Layers,
  ExternalLink,
  Home,
  BookOpen,
  Github,
} from "lucide-react";
import { useSessions, useHealth } from "@/lib/useApi";
import { formatRelativeTime, truncateId } from "@/lib/format";
import { SkeletonCard } from "@/components/SkeletonCard";
import { EmptySessionsState } from "@/components/EmptySessionsState";


function StatusBadge({ status }: { status: string }) {
  const styles = {
    active: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
    killed: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
    completed: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-400 border-zinc-500/30",
  };
  const style = styles[status as keyof typeof styles] ?? styles.completed;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${style}`}
    >
      {status === "active" && (
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 mr-1.5 animate-pulse" />
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
      className="group block rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-5 hover:border-zinc-400 hover:bg-zinc-50 dark:hover:border-zinc-700 dark:hover:bg-zinc-900/60"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <code className="block font-mono text-sm text-zinc-700 dark:text-zinc-300 truncate group-hover:text-sky-600 dark:group-hover:text-sky-400/90">
            {truncateId(id, 24)}
          </code>
          <div className="mt-2 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-500">
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
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          <Home className="h-6 w-6 text-sky-500 dark:text-sky-400/80" />
          Welcome Home
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-500">{statusLine}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-2">
              <Activity className="h-5 w-5 text-sky-500 dark:text-sky-400/80" />
              Active sessions
            </h2>
            <Link
              to="/sessions"
              className="text-sm text-sky-600 dark:text-sky-400/90 hover:text-sky-600 dark:hover:text-sky-400"
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
            <EmptySessionsState />
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
          <div className="rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/30 p-4">
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-3">
              Resources
            </h3>
            <ul className="space-y-2">
              <li>
                <a
                  href="https://github.com/offbeatport/meshaway/tree/main/examples"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-500 hover:text-sky-600 dark:hover:text-sky-400"
                >
                  <BookOpen className="h-3.5 w-3.5 flex-shrink-0" />
                  Examples
                  <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/offbeatport/meshaway"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-500 hover:text-sky-600 dark:hover:text-sky-400"
                >
                  <Github className="h-3.5 w-3.5 flex-shrink-0" />
                  Repository
                  <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60" />
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
