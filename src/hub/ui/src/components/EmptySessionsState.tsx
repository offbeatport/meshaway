import { Terminal } from "lucide-react";

export interface EmptySessionsStateProps {
  /** Optional class for the root div (e.g. "inline-block" when inside a table cell). */
  className?: string;
}

export function EmptySessionsState({ className }: EmptySessionsStateProps) {
  return (
    <div
      className={["rounded-xl border border-dashed border-zinc-400 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/30 p-12 text-center", className].filter(Boolean).join(" ")}
    >
      <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-zinc-200 dark:bg-zinc-800/50 mb-4">
        <Terminal className="h-7 w-7 text-zinc-500 dark:text-zinc-600" />
      </div>
      <h3 className="text-base font-medium text-zinc-700 dark:text-zinc-300">
        No sessions yet
      </h3>
      <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-500 max-w-sm mx-auto text-left">
        Connect your Copilot SDK to the Meshaway bridge and sessions will appear here. You can use Copilot to chat with any{" "}
        <a
          href="https://agentclientprotocol.com/get-started/agents"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-600 dark:text-sky-400 hover:underline"
        >
          ACP agent
        </a>
        . See the{" "}
        <a
          href="https://github.com/offbeatport/meshaway/tree/main/examples"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-600 dark:text-sky-400 hover:underline"
        >
          examples folder
        </a>{" "}
        to get started.
      </p>
    </div>
  );
}
