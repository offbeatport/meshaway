import { Wifi, WifiOff, ExternalLink, Cpu, Server, Stethoscope } from "lucide-react";
import { useHealth, useHealthInfo } from "@/lib/useApi";

export function System() {
  const healthy = useHealth();
  const { healthInfo, loading, error } = useHealthInfo();

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Stethoscope className="h-5 w-5 text-sky-400/80" />
          System status
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Hub, Bridge, and backend connectivity
        </p>
      </div>

      {loading && !healthInfo ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 animate-pulse"
            >
              <div className="h-4 w-1/3 rounded bg-zinc-700/40" />
              <div className="mt-2 h-3 w-1/2 rounded bg-zinc-700/30" />
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {healthy === true ? (
                <Wifi className="h-5 w-5 text-sky-400" />
              ) : (
                <WifiOff className="h-5 w-5 text-amber-400" />
              )}
              <div>
                <p className="font-medium text-zinc-200">Hub</p>
                <p className="text-sm text-zinc-500">
                  {healthy === true ? "Connected" : "Disconnected"}
                </p>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
                healthy === true
                  ? "bg-sky-500/15 text-sky-400 border border-sky-500/30"
                  : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
              }`}
            >
              {healthy === true ? "OK" : "Offline"}
            </span>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-zinc-500" />
              <div>
                <p className="font-medium text-zinc-200">Bridge URL</p>
                <p className="text-sm font-mono text-zinc-400 mt-0.5">
                  {healthInfo?.bridgeUrl ?? "—"}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="flex items-center gap-3">
              <Cpu className="h-5 w-5 text-zinc-500" />
              <div>
                <p className="font-medium text-zinc-200">Default backend</p>
                <p className="text-sm font-mono text-zinc-400 mt-0.5">
                  {healthInfo?.backend ?? "—"}
                </p>
              </div>
            </div>
          </div>

          <p className="text-sm text-zinc-500 flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Run <code className="font-mono text-zinc-400">meshaway doctor</code> in
            your terminal for full diagnostics
          </p>
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-200">{error}</p>
        </div>
      )}
    </div>
  );
}
