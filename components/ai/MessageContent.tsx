"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

type Part = { type: "text"; text: string } | { type: "code"; lang: string; code: string };

/** Splits a reply into text and ``` fenced code blocks. Rendered as plain text — never as HTML. */
function parse(content: string): Part[] {
  const parts: Part[] = [];
  const re = /```([\w+-]*)\n?([\s\S]*?)(?:```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    if (m.index > last) parts.push({ type: "text", text: content.slice(last, m.index) });
    parts.push({ type: "code", lang: m[1], code: m[2].replace(/\n$/, "") });
    last = re.lastIndex;
  }
  if (last < content.length) parts.push({ type: "text", text: content.slice(last) });
  return parts;
}

/** Inline `code` inside text paragraphs. */
function InlineText({ text }: { text: string }) {
  const pieces = text.split(/(`[^`\n]+`)/g);
  return (
    <>
      {pieces.map((p, i) =>
        p.startsWith("`") && p.endsWith("`") && p.length > 2 ? (
          <code key={i} className="rounded bg-black/30 px-1 py-0.5 font-mono text-[0.85em] text-accent-green">
            {p.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard unavailable (e.g. plain http) — ignore
    }
  };
  return (
    <div className="my-2 overflow-hidden rounded-lg border border-base-border bg-black/40">
      <div className="flex items-center justify-between border-b border-base-border px-3 py-1 font-mono text-[11px] text-slate-500">
        <span>{lang || "code"}</span>
        <button type="button" onClick={copy} className="flex items-center gap-1 hover:text-slate-200">
          {copied ? <Check className="h-3 w-3 text-accent-green" /> : <Copy className="h-3 w-3" />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-xs leading-relaxed text-slate-200">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export default function MessageContent({ content }: { content: string }) {
  return (
    <div className="whitespace-pre-wrap break-words">
      {parse(content).map((part, i) =>
        part.type === "code" ? (
          <CodeBlock key={i} lang={part.lang} code={part.code} />
        ) : (
          <InlineText key={i} text={part.text.replace(/^\n+|\n+$/g, "")} />
        ),
      )}
    </div>
  );
}
