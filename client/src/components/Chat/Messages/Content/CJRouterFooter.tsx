import { memo, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Markdown from './Markdown';

// Strips the model's trailing "Sources" / "References" / "Citations" section.
// Two patterns cover the formats models use:
//   Multi-line: "Sources:\n- item\n- item" (server-side regex already handles this
//     in non-streaming path; we mirror it here for streaming)
//   Inline:     "Sources: [1] url, [2] url" (single line — not caught by server)
const MODEL_SOURCE_MULTILINE_RE =
  /\n{1,3}(?:#{1,4}\s*)?(?:sources|references|citations)\s*:?\s*\n(?:\s*(?:[-*]|\d+[.)]|\[\d+\])?.{0,500}\n?){1,40}\s*$/im;
const MODEL_SOURCE_INLINE_RE =
  /\n+(?:#{1,4}\s*)?(?:sources|references|citations):[^\n]*\n*$/im;

function stripModelSourceSection(text: string): string {
  return text
    .replace(MODEL_SOURCE_MULTILINE_RE, '')
    .replace(MODEL_SOURCE_INLINE_RE, '')
    .trimEnd();
}

export interface CJFooterParts {
  mainText: string;
  sourcesText: string; // "CJ Router sources relied upon:\n1. SECONDARY: [Title](url)..."
  footerText: string;  // "---\n_CJ Router: Model: X | Time: Y_"
}

// Plain text markers (no leading newlines) — robust against \r\n vs \n variations.
// We normalize \r\n → \n before searching so Windows-style SSE line endings
// in the stored message text don't prevent detection.
const SOURCES_MARKER = 'CJ Router sources relied upon:';
const FOOTER_MARKER = '\n---\n';

/** Returns parsed parts when the CJ Router sources sentinel is present, else null. */
export function parseCJFooter(content: string): CJFooterParts | null {
  // Normalize CRLF so indexOf works regardless of line-ending style in stored text.
  const text = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const srcIdx = text.indexOf(SOURCES_MARKER);
  if (srcIdx === -1) return null;

  // mainText = everything before "CJ Router sources…", trimmed
  const mainText = text.slice(0, srcIdx).trimEnd();
  // sourcesBlock starts at "CJ Router sources relied upon:..."
  const sourcesBlock = text.slice(srcIdx);

  const ftrIdx = sourcesBlock.indexOf(FOOTER_MARKER);
  if (ftrIdx === -1) {
    return { mainText, sourcesText: sourcesBlock.trimEnd(), footerText: '' };
  }

  return {
    mainText,
    // Everything up to the "\n---\n" separator, trimmed
    sourcesText: sourcesBlock.slice(0, ftrIdx).trimEnd(),
    // "\n---\n_CJ Router:..." → skip leading \n so footerText starts at "---"
    footerText: sourcesBlock.slice(ftrIdx + 1).trimEnd(),
  };
}

function countSources(sourcesText: string): number {
  // CJ Router emits numbered list: "1. SECONDARY: [Title](url)"
  return (sourcesText.match(/^\d+\./gm) ?? []).length;
}

interface CJRouterFooterProps {
  mainText: string;
  sourcesText: string;
  footerText: string;
  isLatestMessage: boolean;
}

const CJRouterFooter = memo(function CJRouterFooter({
  mainText,
  sourcesText,
  footerText,
  isLatestMessage,
}: CJRouterFooterProps) {
  const [open, setOpen] = useState(false);
  const cleanMain = useMemo(() => stripModelSourceSection(mainText), [mainText]);
  const sourceCount = useMemo(() => countSources(sourcesText), [sourcesText]);

  return (
    <>
      <Markdown content={cleanMain} isLatestMessage={isLatestMessage} />

      {sourcesText.length > 0 && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex cursor-pointer items-center gap-1 py-0.5 text-xs text-text-secondary hover:text-text-primary select-none"
            aria-expanded={open}
          >
            <ChevronDown
              className={`h-3 w-3 flex-shrink-0 transition-transform duration-200${open ? ' rotate-180' : ''}`}
              aria-hidden="true"
            />
            Sources{sourceCount > 0 ? ` (${sourceCount})` : ''}
          </button>
          {open && (
            <div className="mt-1 border-l-2 border-border-light pl-3">
              <Markdown content={sourcesText} isLatestMessage={false} />
            </div>
          )}
        </div>
      )}

      {footerText.length > 0 && (
        <Markdown content={footerText} isLatestMessage={false} />
      )}
    </>
  );
});

CJRouterFooter.displayName = 'CJRouterFooter';
export default CJRouterFooter;
