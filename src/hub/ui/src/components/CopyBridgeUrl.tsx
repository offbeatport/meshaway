import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";

const BRIDGE_URL = "http://127.0.0.1:4321";

export function CopyBridgeUrl({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(BRIDGE_URL);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <button
      onClick={handleCopy}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-sm font-mono ${className}`}
    >
      {copied ? (
        <Check className="h-4 w-4 text-sky-400" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
      {copied ? "Copied" : "Copy Bridge URL"}
    </button>
  );
}
