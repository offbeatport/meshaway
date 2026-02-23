import { useState, useMemo, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Activity,
  RefreshCw,
  Terminal,
  AlertCircle,
  Download,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Filter,
  Play,
} from "lucide-react";
import { useSessions } from "@/lib/useApi";
import { formatRelativeTime, formatDateTime, truncateId, formatDuration } from "@/lib/format";
import { SkeletonCard } from "@/components/SkeletonCard";
import { getSessionExportUrl } from "@/lib/api";
import type { Session } from "@/lib/api";

type StatusFilter = "all" | "active" | "completed" | "killed";
type SortKey = "startTime" | "updatedAt" | "status" | "frames" | "duration";

function StatusBadge({ status }: { status: string }) {
  const styles = {
    active: "bg-sky-500/15 text-sky-400 border-sky-500/30",
    killed: "bg-red-500/15 text-red-400 border-red-500/30",
    completed: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30",
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

function sessionDuration(s: Session): number {
  const frames = s.frames ?? [];
  if (frames.length < 2) return 0;
  const first = (frames as { timestamp?: number }[])[0]?.timestamp ?? 0;
  const last = (frames as { timestamp?: number }[])[frames.length - 1]?.timestamp ?? 0;
  return last - first;
}

function sessionTokens(s: Session): number {
  const frames = (s.frames ?? []) as { payload?: unknown }[];
  let n = 0;
  for (const f of frames) {
    const p = f.payload as { delta?: string; text?: string } | undefined;
    if (p?.delta && typeof p.delta === "string") n += p.delta.length;
    if (p?.text && typeof p.text === "string") n += p.text.length;
  }
  return n;
}

export function SessionsList() {
  const navigate = useNavigate();
  const { sessions, loading, error, refresh } = useSessions(4000);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("startTime");
  const [sortAsc, setSortAsc] = useState(false);
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [metricsOpen, setMetricsOpen] = useState(true);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const sortMenuRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target as Node)) setSortMenuOpen(false);
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) setFilterMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredSessions = useMemo(() => {
    let list = sessions;
    if (statusFilter !== "all") list = list.filter((s) => s.status === statusFilter);
    if (agentFilter !== "all") {
      list = list.filter((s) => {
        const agent = (s as Session & { agent?: string }).agent;
        return agent === agentFilter;
      });
    }
    return list;
  }, [sessions, statusFilter, agentFilter]);

  const sortedSessions = useMemo(() => {
    const list = [...filteredSessions];
    const mult = sortAsc ? 1 : -1;
    list.sort((a, b) => {
      switch (sortKey) {
        case "startTime":
          return mult * (a.createdAt - b.createdAt);
        case "updatedAt":
          return mult * (a.updatedAt - b.updatedAt);
        case "status":
          return mult * String(a.status).localeCompare(String(b.status));
        case "frames":
          return mult * ((a.frames?.length ?? 0) - (b.frames?.length ?? 0));
        case "duration":
          return mult * (sessionDuration(a) - sessionDuration(b));
        default:
          return mult * (b.createdAt - a.createdAt);
      }
    });
    return list;
  }, [filteredSessions, sortKey, sortAsc]);

  const metrics = useMemo(() => {
    const active = sessions.filter((s) => s.status === "active").length;
    const completed = sessions.filter((s) => s.status === "completed").length;
    const killed = sessions.filter((s) => s.status === "killed").length;
    const totalFrames = sessions.reduce((acc, s) => acc + (s.frames?.length ?? 0), 0);
    const totalTokens = sessions.reduce((acc, s) => acc + sessionTokens(s), 0);
    return { active, completed, killed, totalFrames, totalTokens };
  }, [sessions]);

  const agents = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      const a = (s as Session & { agent?: string }).agent;
      if (a) set.add(a);
    });
    return Array.from(set);
  }, [sessions]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else {
      setSortKey(key);
      setSortAsc(key === "status");
    }
  };

  if (loading && sessions.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <Activity className="h-5 w-5 text-sky-400/80" />
              Sessions
            </h2>
            <p className="mt-1 text-sm text-zinc-500">Loading…</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
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
                className="mt-4 flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm font-medium"
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

  const sortLabels: Record<SortKey, string> = {
    startTime: "Start time",
    updatedAt: "Updated",
    status: "Status",
    frames: "Frames",
    duration: "Duration",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2 text-zinc-900 dark:text-zinc-100">
            <Activity className="h-5 w-5 text-sky-500 dark:text-sky-400/80" />
            Sessions
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-500">
            {sessions.length} session{sessions.length !== 1 ? "s" : ""} total
          </p>
        </div>
      </div>

      {/* Metrics */}
      <section className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
        <button
          type="button"
          onClick={() => setMetricsOpen((o) => !o)}
          className="w-full flex items-center justify-between text-sm font-semibold text-zinc-300"
        >
          <span className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-sky-400/80" />
            Metrics
          </span>
          {metricsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>
        {metricsOpen && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-4">
            <div className="rounded-lg bg-zinc-800/50 p-3">
              <p className="text-xs text-zinc-500">Active</p>
              <p className="text-lg font-semibold text-sky-400">{metrics.active}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3">
              <p className="text-xs text-zinc-500">Completed</p>
              <p className="text-lg font-semibold text-zinc-300">{metrics.completed}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3">
              <p className="text-xs text-zinc-500">Killed</p>
              <p className="text-lg font-semibold text-red-400/90">{metrics.killed}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3">
              <p className="text-xs text-zinc-500">Total frames</p>
              <p className="text-lg font-semibold text-zinc-300">{metrics.totalFrames}</p>
            </div>
            <div className="rounded-lg bg-zinc-800/50 p-3">
              <p className="text-xs text-zinc-500">Tokens (approx)</p>
              <p className="text-lg font-semibold text-zinc-300">{metrics.totalTokens}</p>
            </div>
          </div>
        )}
      </section>

      {/* Sessions list: filters and table */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 overflow-visible">
        <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
          <div className="relative" ref={sortMenuRef}>
            <button
              type="button"
              onClick={() => setSortMenuOpen((o) => !o)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              aria-expanded={sortMenuOpen}
              aria-haspopup="true"
            >
              <ArrowUpDown className="h-4 w-4" />
              Sort: {sortLabels[sortKey]} {sortAsc ? "↑" : "↓"}
            </button>
            {sortMenuOpen && (
              <div className="absolute left-0 top-full mt-1 py-1 min-w-[10rem] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg z-50">
                {(["startTime", "updatedAt", "status", "frames", "duration"] as const).map((key) => (
                  <div key={key} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggleSort(key)}
                      className={`flex-1 text-left px-3 py-2 text-sm rounded-none first:rounded-t-lg last:rounded-b-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 ${sortKey === key ? "text-sky-600 dark:text-sky-400 font-medium" : "text-zinc-700 dark:text-zinc-300"
                        }`}
                    >
                      {sortLabels[key]}
                    </button>
                    {sortKey === key && (
                      <button
                        type="button"
                        onClick={() => setSortAsc((a) => !a)}
                        className="p-2 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                        title={sortAsc ? "Ascending" : "Descending"}
                      >
                        {sortAsc ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="relative" ref={filterMenuRef}>
            <button
              type="button"
              onClick={() => setFilterMenuOpen((o) => !o)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700"
              aria-expanded={filterMenuOpen}
              aria-haspopup="true"
            >
              <Filter className="h-4 w-4" />
              Filter
              {(statusFilter !== "all" || agentFilter !== "all") && (
                <span className="inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-sky-500/20 text-sky-600 dark:text-sky-400 text-xs font-medium">
                  {[statusFilter !== "all", agentFilter !== "all"].filter(Boolean).length}
                </span>
              )}
            </button>
            {filterMenuOpen && (
              <div className="absolute left-0 top-full mt-1 py-2 min-w-[12rem] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg z-50">
                <p className="px-3 py-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                  Status
                </p>
                {(["all", "active", "completed", "killed"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => { setStatusFilter(value); setFilterMenuOpen(false); }}
                    className={`block w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${statusFilter === value ? "text-sky-600 dark:text-sky-400 font-medium" : "text-zinc-700 dark:text-zinc-300"
                      }`}
                  >
                    {value === "all" ? "All status" : value.charAt(0).toUpperCase() + value.slice(1)}
                  </button>
                ))}
                {agents.length > 0 && (
                  <>
                    <p className="px-3 py-1.5 mt-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      Agent
                    </p>
                    <button
                      type="button"
                      onClick={() => { setAgentFilter("all"); setFilterMenuOpen(false); }}
                      className={`block w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 ${agentFilter === "all" ? "text-sky-600 dark:text-sky-400 font-medium" : "text-zinc-700 dark:text-zinc-300"
                        }`}
                    >
                      All agents
                    </button>
                    {agents.map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => { setAgentFilter(a); setFilterMenuOpen(false); }}
                        className={`block w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 truncate ${agentFilter === a ? "text-sky-600 dark:text-sky-400 font-medium" : "text-zinc-700 dark:text-zinc-300"
                          }`}
                      >
                        {a}
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
          <button
            onClick={refresh}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            title="Refresh"
            aria-label="Refresh sessions"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
          <span className="text-sm text-zinc-500 dark:text-zinc-500 ml-auto">
            Showing {sortedSessions.length} session{sortedSessions.length !== 1 ? "s" : ""}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50">
                <th className="text-left py-3 px-4 font-medium text-zinc-500 dark:text-zinc-400">Session</th>
                <th className="text-left py-3 px-4 font-medium text-zinc-500 dark:text-zinc-400">Status</th>
                <th className="text-left py-3 px-4 font-medium text-zinc-500 dark:text-zinc-400">Start time</th>
                <th className="text-left py-3 px-4 font-medium text-zinc-500 dark:text-zinc-400">Updated</th>
                <th className="text-right py-3 px-4 font-medium text-zinc-500 dark:text-zinc-400">Frames</th>
                <th className="text-right py-3 px-4 font-medium text-zinc-500 dark:text-zinc-400">Latency</th>
                <th className="text-right py-3 px-4 font-medium text-zinc-500 dark:text-zinc-400">Tokens</th>
                <th className="text-left py-3 px-4 font-medium text-zinc-500 dark:text-zinc-400">Agent</th>
                <th className="text-left py-3 px-4 font-medium text-zinc-500 dark:text-zinc-400">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sortedSessions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center">
                    <div className="rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 p-12 inline-block">
                      <div className="inline-flex justify-center w-14 h-14 rounded-2xl bg-zinc-800/50 mb-4">
                        <Terminal className="h-7 w-7 text-zinc-600" />
                      </div>
                      <h3 className="text-base font-medium text-zinc-300">No sessions yet</h3>
                      <p className="mt-2 text-zinc-500 text-sm max-w-sm">
                        Connect Copilot SDK <code className="text-zinc-400">cliUrl</code> to{" "}
                        <code className="text-sky-400/80">http://127.0.0.1:4321</code>
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                sortedSessions.map((s) => (
                  <tr
                    key={s.id}
                    className="border-b border-zinc-800/80 hover:bg-zinc-800/30"
                  >
                    <td className="py-3 px-4">
                      <Link
                        to={`/sessions/${s.id}`}
                        className="font-mono text-zinc-300 hover:text-sky-400/90 truncate max-w-[140px] inline-block"
                      >
                        {truncateId(s.id, 20)}
                      </Link>
                    </td>
                    <td className="py-3 px-4">
                      <StatusBadge status={s.status} />
                    </td>
                    <td className="py-3 px-4 text-zinc-500 whitespace-nowrap">
                      {formatDateTime(s.createdAt)}
                    </td>
                    <td className="py-3 px-4 text-zinc-500 whitespace-nowrap">
                      {formatRelativeTime(s.updatedAt)}
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-400">
                      {s.frames?.length ?? 0}
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-400">
                      {sessionDuration(s) ? formatDuration(sessionDuration(s)) : "—"}
                    </td>
                    <td className="py-3 px-4 text-right text-zinc-400">
                      {sessionTokens(s) || "—"}
                    </td>
                    <td className="py-3 px-4 text-zinc-500 text-xs">
                      {(s as Session & { agent?: string }).agent ?? "—"}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            navigate(`/playground?loadSessionId=${encodeURIComponent(s.id)}`);
                          }}
                          className="inline-flex items-center gap-1 text-xs text-sky-400/90 hover:text-sky-400"
                          title="Open in Playground"
                        >
                          <Play className="h-3.5 w-3.5" />
                          Playground
                        </button>
                        <a
                          href={getSessionExportUrl(s.id)}
                          download={`session-${s.id}.jsonl`}
                          className="inline-flex items-center gap-1 text-xs text-sky-400/90 hover:text-sky-400"
                          title="Export JSONL"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Export
                        </a>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
