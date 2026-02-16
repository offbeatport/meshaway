import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Collapsible, Dialog, Tabs } from "@base-ui/react";
import { Brain, ChevronDown, FileText, ShieldAlert, Terminal } from "lucide-react";

type ActionStatus = "pending" | "approved" | "success" | "failed";

interface ThoughtEntry {
  id: string;
  content: string;
  summary: string;
  rawJson: string;
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

interface SessionHistoryEntry {
  id: string;
  type: string;
  summary: string;
  rawJson: string;
  timestamp: number;
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
  const [history, setHistory] = useState<SessionHistoryEntry[]>([]);

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
          const rawJson = JSON.stringify(incoming, null, 2);
          const content = maskSensitive(String(incoming.payload.content ?? ""));
          const entry: ThoughtEntry = {
            id: String(incoming.payload.id ?? `${Date.now()}`),
            content,
            summary: content.length > 88 ? `${content.slice(0, 88)}...` : content,
            rawJson,
            timestamp: Number(incoming.payload.timestamp ?? Date.now()),
          };
          setThoughts((prev) => [...prev.slice(-199), entry]);
          setHistory((prev) => [
            ...prev.slice(-399),
            {
              id: `h_${entry.id}`,
              type: incoming.type,
              summary: entry.summary || "Agent thought chunk",
              rawJson,
              timestamp: entry.timestamp,
            },
          ]);
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
          setHistory((prev) => [
            ...prev.slice(-399),
            {
              id: `h_${next.id}_${Date.now()}`,
              type: incoming.type,
              summary: `${incoming.type}: ${next.command} (${next.status})`,
              rawJson: JSON.stringify(incoming, null, 2),
              timestamp: next.timestamp,
            },
          ]);
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
          setHistory((prev) => [
            ...prev.slice(-399),
            {
              id: `h_perm_${item.id}_${Date.now()}`,
              type: incoming.type,
              summary: `permission requested: ${item.command}`,
              rawJson: JSON.stringify(incoming, null, 2),
              timestamp: Date.now(),
            },
          ]);
          return;
        }

        if (incoming.type === "permission_resolved") {
          const id = String(incoming.payload.id ?? "");
          setPendingPermissions((prev) => prev.filter((permission) => permission.id !== id));
          setHistory((prev) => [
            ...prev.slice(-399),
            {
              id: `h_res_${id}_${Date.now()}`,
              type: incoming.type,
              summary: `permission resolved: ${id}`,
              rawJson: JSON.stringify(incoming, null, 2),
              timestamp: Date.now(),
            },
          ]);
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
  const latestHistory = useMemo(() => history.slice(-120).reverse(), [history]);
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
          <Tabs.Root defaultValue="live">
            <Tabs.List className="mb-3 inline-flex rounded-lg border border-zinc-800 bg-zinc-950 p-1 gap-1">
              <Tabs.Tab
                value="live"
                className="rounded px-3 py-1.5 text-xs text-zinc-300 data-[selected]:bg-zinc-800 data-[selected]:text-zinc-100"
              >
                Live Interceptions
              </Tabs.Tab>
              <Tabs.Tab
                value="history"
                className="rounded px-3 py-1.5 text-xs text-zinc-300 data-[selected]:bg-zinc-800 data-[selected]:text-zinc-100"
              >
                Session History
              </Tabs.Tab>
            </Tabs.List>

            <Tabs.Panel value="live" keepMounted>
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-zinc-300" />
                <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-300">The Thought Stream</h2>
              </div>
              <div className="h-[26rem] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
                {latestThoughts.length === 0 ? (
                  <p className="text-zinc-500 text-xs">No thought events yet.</p>
                ) : (
                  latestThoughts.map((thought) => (
                    <Collapsible.Root key={thought.id} className="rounded border border-zinc-800 bg-zinc-900/40">
                      <Collapsible.Trigger className="w-full flex items-center justify-between px-3 py-2 text-left">
                        <span className="text-xs text-zinc-200 font-mono break-words">{thought.summary || "Thought block"}</span>
                        <ChevronDown className="h-4 w-4 text-zinc-500" />
                      </Collapsible.Trigger>
                      <Collapsible.Panel className="px-3 pb-3 space-y-2">
                        <p className="text-xs text-zinc-300 whitespace-pre-wrap break-words font-mono">{thought.content}</p>
                        <pre className="text-[11px] text-zinc-400 whitespace-pre-wrap break-words font-mono border border-zinc-800 rounded p-2 bg-zinc-950">
{thought.rawJson}
                        </pre>
                      </Collapsible.Panel>
                    </Collapsible.Root>
                  ))
                )}
              </div>
            </Tabs.Panel>

            <Tabs.Panel value="history">
              <div className="h-[26rem] overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3 space-y-2">
                {latestHistory.length === 0 ? (
                  <p className="text-zinc-500 text-xs">No session history yet.</p>
                ) : (
                  latestHistory.map((entry) => (
                    <Collapsible.Root key={entry.id} className="rounded border border-zinc-800 bg-zinc-900/40">
                      <Collapsible.Trigger className="w-full flex items-center justify-between px-3 py-2 text-left">
                        <span className="text-xs text-zinc-200 font-mono break-words">{entry.summary}</span>
                        <ChevronDown className="h-4 w-4 text-zinc-500" />
                      </Collapsible.Trigger>
                      <Collapsible.Panel className="px-3 pb-3">
                        <pre className="text-[11px] text-zinc-400 whitespace-pre-wrap break-words font-mono border border-zinc-800 rounded p-2 bg-zinc-950">
{entry.rawJson}
                        </pre>
                      </Collapsible.Panel>
                    </Collapsible.Root>
                  ))
                )}
              </div>
            </Tabs.Panel>
          </Tabs.Root>
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
