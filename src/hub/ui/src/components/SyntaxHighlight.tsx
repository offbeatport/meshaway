import { Highlight, type Language } from "prism-react-renderer";
import Prism from "prismjs";
import "prismjs/components/prism-json";
import "prismjs/components/prism-javascript";

const TOKEN_CLASS: Record<string, string> = {
  keyword: "text-sky-700 dark:text-sky-300",
  "class-name": "text-violet-700 dark:text-violet-300",
  function: "text-violet-700 dark:text-violet-300",
  string: "text-emerald-700 dark:text-emerald-300",
  number: "text-amber-700 dark:text-amber-300",
  property: "text-zinc-800 dark:text-zinc-400",
  punctuation: "text-zinc-600 dark:text-zinc-500",
  operator: "text-zinc-600 dark:text-zinc-500",
  comment: "text-zinc-500 dark:text-zinc-500 italic",
  boolean: "text-sky-700 dark:text-sky-300",
};

function getTokenClassName(types: string[]): string {
  for (const t of types) {
    const c = TOKEN_CLASS[t];
    if (c) return c;
  }
  return "text-zinc-800 dark:text-zinc-300";
}

export interface SyntaxHighlightProps {
  code: string;
  language: Language;
  className?: string;
  preClassName?: string;
  /** If true, force no background (overrides theme/style). */
  noBackground?: boolean;
}

export function SyntaxHighlight({
  code,
  language,
  className,
  preClassName = "p-3 text-xs font-mono bg-zinc-100 dark:bg-zinc-900/30 rounded overflow-auto",
  noBackground = false,
}: SyntaxHighlightProps) {
  return (
    <Highlight prism={Prism} code={code.trim()} language={language}>
      {({ className: innerClassName, style, tokens, getLineProps, getTokenProps }) => (
        <pre
          className={[innerClassName, preClassName, className, noBackground && "!bg-transparent"].filter(Boolean).join(" ")}
          style={noBackground ? { ...style, backgroundColor: "transparent" } : style}
        >
          {tokens.map((line, i) => (
            <div key={i} {...getLineProps({ line })}>
              {line.map((token, key) => {
                const { className: _, ...rest } = getTokenProps({ token });
                return (
                  <span key={key} {...rest} className={getTokenClassName(token.types)} />
                );
              })}
            </div>
          ))}
        </pre>
      )}
    </Highlight>
  );
}
