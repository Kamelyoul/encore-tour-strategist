import { Fragment, type ReactNode } from "react";

interface Props {
  text: string;
  onCite?: (index: number) => void;
}

const INLINE = /(\*\*[^*]+\*\*|\[Q\d+(?:\s*,\s*Q\d+)*\])/g;

function inline(text: string, onCite?: (index: number) => void): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    if (!part) return null;
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-cream">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (/^\[Q\d/.test(part)) {
      const ids = part.match(/\d+/g)?.map(Number) ?? [];
      return (
        <span key={i} className="whitespace-nowrap">
          {ids.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => onCite?.(id)}
              className="ml-1 rounded border border-amber/40 bg-amber/10 px-1 font-mono text-[10px] text-amber hover:bg-amber/25"
              title="Show the Qloo request behind this claim"
            >
              Q{id}
            </button>
          ))}
        </span>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

/** Tiny renderer for the brief: ##/### headings, "- " bullets, **bold** and [Q#] citation chips. */
export function Markdown({ text, onCite }: Props) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => {
    if (!bullets.length) return;
    const items = bullets;
    bullets = [];
    blocks.push(
      <ul key={`u${blocks.length}`} className="my-2 space-y-1.5 pl-1">
        {items.map((b, i) => (
          <li key={i} className="flex gap-2 text-[15px] leading-relaxed text-cream/90">
            <span className="mt-2.5 h-1 w-1 shrink-0 rounded-full bg-amber" />
            <span>{inline(b, onCite)}</span>
          </li>
        ))}
      </ul>,
    );
  };
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (/^[-*]\s+/.test(line)) {
      bullets.push(line.replace(/^[-*]\s+/, ""));
      continue;
    }
    flush();
    if (!line) continue;
    if (line.startsWith("### ")) {
      blocks.push(
        <h4 key={blocks.length} className="eyebrow mt-5 mb-1 !text-amber">
          {line.slice(4)}
        </h4>,
      );
    } else if (line.startsWith("## ") || line.startsWith("# ")) {
      blocks.push(
        <h3 key={blocks.length} className="font-display text-3xl uppercase tracking-wide text-cream">
          {line.replace(/^#+\s+/, "")}
        </h3>,
      );
    } else {
      blocks.push(
        <p key={blocks.length} className="my-2 text-[15px] leading-relaxed text-cream/90">
          {inline(line, onCite)}
        </p>,
      );
    }
  }
  flush();
  return <div>{blocks}</div>;
}
