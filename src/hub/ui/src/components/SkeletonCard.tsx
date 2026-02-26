export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-5 animate-pulse">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-4 w-3/4 rounded bg-zinc-300 dark:bg-zinc-700/60" />
          <div className="flex gap-3">
            <div className="h-3 w-16 rounded bg-zinc-300/80 dark:bg-zinc-700/40" />
            <div className="h-3 w-12 rounded bg-zinc-300/80 dark:bg-zinc-700/40" />
          </div>
        </div>
        <div className="h-6 w-14 rounded-md bg-zinc-300 dark:bg-zinc-700/50" />
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div className="rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-4 animate-pulse">
      <div className="flex items-center gap-3">
        <div className="h-4 w-4 rounded bg-zinc-300 dark:bg-zinc-700/50" />
        <div className="h-4 flex-1 max-w-[200px] rounded bg-zinc-300/80 dark:bg-zinc-700/40" />
        <div className="h-4 w-20 rounded bg-zinc-300/80 dark:bg-zinc-700/40" />
      </div>
    </div>
  );
}
