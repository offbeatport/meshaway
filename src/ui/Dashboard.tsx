import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Dialog } from "@base-ui/react";
import { Brain, FileText, ShieldAlert, Terminal } from "lucide-react";

type ActionStatus = "pending" | "approved" | "success" | "failed";

interface ThoughtEntry {
  id: string;
  content: string;
  timestamp: number;
}

interface ActionEntry {
  id: string;
  command: string;
  status: ActionStatus;
  timestamp: number;
}

interface PermissionEntry {
  id: string;
  title: string;
  command: string;
  risk: "low" | "medium" | "high";
}

declare global {
  interface Window {
    __MESH_OBSERVER_CONFIG__?: {
      token: string;
      eventsUrl: string;
      permissionUrl: string;
    };
  }
}

const statusClasses: Record<ActionStatus, string> = {
  pending: "bg-amber-500/20 text-amber-200 border border-amber-500/40",
  approved: "bg-sky-500/20 text-sky-200 border border-sky-500/40",
  success: "bg-emerald-500/20 text-emerald-200 border border-emerald-500/40",
  failed: "bg-red-500/20 text-red-200 border border-red-500/40",
};

function maskSensitive(text: string): string {
  return text
    .replace(/\b(sk-[A-Za-z0-9_-]{16,})\b/g, "[REDACTED]")
    .replace(/\b(ghp_[A-Za-z0-9]{20,})\b/g, "[REDACTED]")
    .replace(/\b(ANTHROPIC_API_KEY|GITHUB_TOKEN|GOOGLE_API_KEY|OPENAI_API_KEY)\s*=\s*([^\s]+)/gi, "$1=[REDACTED]");
}

function Dashboard(): React.JSX.Element {
  const config = window.__MESH_OBSERVER_CONFIG__;
  const [thoughts, setThoughts] = useState<ThoughtEntry[]>([]);
  const [actions, setActions] = useState<ActionEntry[]>([]);
  const [pendingPermissions, setPendingPermissions] = useState<PermissionEntry[]>([]);

  useEffect(() => {
    if (!config) {
      return;
    }

    const source = new EventSource(`${config.eventsUrl}?token=${encodeURIComponent(config.token)}`);
    source.onmessage = (event) => {
      try {
        const incoming = JSON.parse(event.data) as {
          type: string;
          payload: Record<string, unknown>;
        };
        if (incoming.type === "thought_chunk") {
          const entry: ThoughtEntry = {
            id: String(incoming.payload.id ?? `${Date.now()}`),
            content: maskSensitive(String(incoming.payload.content ?? "")),
            timestamp: Number(incoming.payload.timestamp ?? Date.now()),
          };
          setThoughts((prev) => [...prev.slice(-199), entry]);
          return;
        }

        if (incoming.type === "action_intercepted" || incoming.type === "action_status_changed") {
          const next: ActionEntry = {
            id: String(incoming.payload.id ?? `${Date.now()}`),
            command: maskSensitive(String(incoming.payload.command ?? "unknown")),
            status: String(incoming.payload.status ?? "pending") as ActionStatus,
            timestamp: Number(incoming.payload.timestamp ?? Date.now()),
          };
          setActions((prev) => {
            const index = prev.findIndex((item) => item.id === next.id);
            if (index === -1) {
              return [...prev.slice(-199), next];
            }
            const copy = [...prev];
            copy[index] = next;
            return copy;
          });
          return;
        }

        if (incoming.type === "permission_requested") {
          const item: PermissionEntry = {
            id: String(incoming.payload.id ?? `${Date.now()}`),
            title: String(incoming.payload.title ?? "Permission required"),
            command: maskSensitive(String(incoming.payload.command ?? "sensitive command")),
            risk: (incoming.payload.risk as PermissionEntry["risk"]) ?? "medium",
          };
          setPendingPermissions((prev) => [...prev, item]);
          return;
        }

        if (incoming.type === "permission_resolved") {
          const id = String(incoming.payload.id ?? "");
          setPendingPermissions((prev) => prev.filter((permission) => permission.id !== id));
        }
      } catch {
        // Ignore malformed events to keep dashboard responsive.
      }
    };

    return () => {
      source.close();
    };
  }, [config]);

  const latestThoughts = useMemo(() => thoughts.slice(-80).reverse(), [thoughts]);
  const latestActions = useMemo(() => actions.slice(-40).reverse(), [actions]);
  const activePermission = pendingPermissions[0];

  const resolvePermission = async (id: string, decision: "approved" | "denied"): Promise<void> => {
    if (!config) {
      return;
    }
    await fetch(config.permissionUrl.replace(":id", encodeURIComponent(id)), {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        token: config.token,
        decision,
      }),
    });
    setPendingPermissions((prev) => prev.filter((entry) => entry.id !== id));
  };

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100 p-4 md:p-6">
      <header className="mb-6 border border-zinc-800 rounded-xl p-4 bg-zinc-900/60 backdrop-blur">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Terminal className="w-5 h-5 text-zinc-300" />
            <h1 className="text-lg md:text-xl font-semibold tracking-tight">Meshaway Observer</h1>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="inline-flex h-2.5 w-2.5 rounded-full bg-cyan-400 animate-agent-pulse" />
            Agent Thinking
          </div>
        </div>
      </header>

      <section className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <article className="xl:col-span-2 border border-zinc-800 rounded-xl p-4 bg-zinc-900/40">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-zinc-300" />
            <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">The Thought Stream</h2>
          </div>
          <div className="h-[26rem] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
            {latestThoughts.length === 0 ? (
              <p className="text-zinc-500 text-xs">No thought events yet.</p>
            ) : (
              latestThoughts.map((thought) => (
                <p key={thought.id} className="text-xs text-zinc-200 whitespace-pre-wrap break-words font-mono">
                  {thought.content}
                </p>
              ))
            )}
          </div>
        </article>

        <aside className="space-y-4">
          <article className="border border-zinc-800 rounded-xl p-4 bg-zinc-900/40">
            <div className="flex items-center gap-2 mb-3">
              <FileText className="w-4 h-4 text-zinc-300" />
              <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">The Action Tracker</h2>
            </div>
            <div className="max-h-[18rem] overflow-auto space-y-2">
              {latestActions.length === 0 ? (
                <p className="text-zinc-500 text-xs">No intercepted actions yet.</p>
              ) : (
                latestActions.map((action) => (
                  <div key={action.id} className="rounded-lg border border-zinc-800 p-2 bg-zinc-950">
                    <p className="text-xs text-zinc-200 font-mono break-words">{action.command}</p>
                    <span className={`inline-flex mt-2 text-[11px] px-2 py-0.5 rounded ${statusClasses[action.status]}`}>
                      {action.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          </article>
        </aside>
      </section>

      <Dialog.Root open={Boolean(activePermission)}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 bg-black/55" />
          <Dialog.Popup className="fixed left-1/2 top-1/2 w-[min(30rem,92vw)] -translate-x-1/2 -translate-y-1/2 border border-zinc-800 rounded-xl bg-zinc-900 p-4 shadow-xl">
            <Dialog.Title className="text-sm font-semibold text-zinc-100 flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-300" />
              Permission Gateway
            </Dialog.Title>
            <Dialog.Description className="mt-2 text-xs text-zinc-300">
              {activePermission?.title}
            </Dialog.Description>
            <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 p-3">
              <p className="text-xs font-mono text-zinc-200">{activePermission?.command}</p>
            </div>
            <div className="mt-3 text-[11px] uppercase tracking-wide text-zinc-500">
              Risk: {activePermission?.risk ?? "unknown"}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded border border-zinc-700 text-zinc-200 hover:bg-zinc-800"
                onClick={() => activePermission && resolvePermission(activePermission.id, "denied")}
              >
                Deny
              </button>
              <button
                type="button"
                className="text-xs px-3 py-1.5 rounded border border-emerald-500/70 text-emerald-200 hover:bg-emerald-500/20"
                onClick={() => activePermission && resolvePermission(activePermission.id, "approved")}
              >
                Approve
              </button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </main>
  );
}

function boot(): void {
  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Missing root element");
  }
  createRoot(rootElement).render(<Dashboard />);
}

boot();
