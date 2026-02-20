import { useState, useCallback } from "react";
import { Route, Settings } from "lucide-react";
import { useRouting } from "@/lib/useApi";

export function Routing() {
  const { rules, loading, setBackend, refresh } = useRouting();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  const backend = rules[0]?.backend ?? "";

  const startEdit = useCallback(() => {
    setValue(backend);
    setEditing(true);
  }, [backend]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      await setBackend(value.trim());
      setEditing(false);
      refresh();
    } finally {
      setSaving(false);
    }
  }, [value, setBackend, refresh]);

  const cancel = useCallback(() => {
    setEditing(false);
    setValue(backend);
  }, [backend]);

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-xl font-semibold flex items-center gap-2">
          <Route className="h-5 w-5 text-sky-400/80" />
          Backend routing
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          Configure which backend the Bridge routes requests to
        </p>
      </div>

      {loading ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 animate-pulse">
          <div className="h-4 w-1/3 rounded bg-zinc-700/40" />
          <div className="mt-3 h-10 rounded-lg bg-zinc-700/30" />
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <label className="block text-sm font-medium text-zinc-300 mb-2">
            Default backend
          </label>
          {editing ? (
            <div className="flex gap-2">
              <input
                type="text"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. ollama, gemini-cli"
                className="flex-1 px-4 py-2 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500/50"
                autoFocus
              />
              <button
                onClick={save}
                disabled={saving || !value.trim()}
                className="px-4 py-2 rounded-lg bg-sky-500/20 text-sky-400 border border-sky-500/30 hover:bg-sky-500/30 disabled:opacity-50 text-sm font-medium"
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={cancel}
                disabled={saving}
                className="px-4 py-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 text-sm font-medium"
              >
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <code className="flex-1 px-4 py-2 rounded-lg bg-zinc-800/50 text-zinc-300 font-mono text-sm">
                {backend || "not configured"}
              </code>
              <button
                onClick={startEdit}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                <Settings className="h-4 w-4" />
                Edit
              </button>
            </div>
          )}
        </div>
      )}

      <p className="mt-4 text-xs text-zinc-600">
        MVP: single default backend. Match rules and multiple backends coming in
        v2.
      </p>
    </div>
  );
}
