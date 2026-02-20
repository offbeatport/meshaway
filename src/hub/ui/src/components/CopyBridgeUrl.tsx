import { useState, useCallback } from "react";
import { Copy, Check } from "lucide-react";

function getHubUrl(): string {
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return "http://127.0.0.1:7337";
}

export function CopyBridgeUrl({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const hubUrl = getHubUrl();

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(hubUrl);
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
      {copied ? "Copied" : "Copy Hub URL"}
    </button>
  );
}
