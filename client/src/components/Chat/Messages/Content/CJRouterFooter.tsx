import { memo, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import Markdown from './Markdown';

// Sentinels must match what build_web_sources_footer() and build_response_footer()
// emit in router.py. The sources sentinel starts with \n\n so mainText never
// includes trailing whitespace; the timing sentinel starts with \n\n---\n.
const CJ_SOURCES_SENTINEL = '\n\nCJ Router sources relied upon:';
const CJ_TIMING_SENTINEL = '\n\n---\n_CJ Router:';

// Mirrors strip_model_source_section() in router.py — strips the model's own
// trailing "Sources" / "References" / "Citations" section. This is needed in
// streaming path where the server-side strip hasn't run.
const MODEL_SOURCE_RE =
  /\n{1,3}(?:#{1,4}\s*)?(?:sources|references|citations)\s*:?\s*\n(?:\s*(?:[-*]|\d+[.)]|\[\d+\])?.{0,500}\n?){1,40}\s*$/im;

function stripModelSourceSection(text: string): string {
  return text.replace(MODEL_SOURCE_RE, '').trimEnd();
}

export interface CJFooterParts {
  mainText: string;
  sourcesText: string; // "CJ Router sources relied upon:\n1. SECONDARY: [Title](url)..."
  footerText: string;  // "---\n_CJ Router: Model: X | Time: Y_"
}

/** Returns parsed parts when the CJ Router sources sentinel is present, else null. */
export function parseCJFooter(content: string): CJFooterParts | null {
  const srcIdx = content.indexOf(CJ_SOURCES_SENTINEL);
  if (srcIdx === -1) {
    return null;
  }

  const mainText = content.slice(0, srcIdx);
  // Skip the leading \n\n — sources section starts with "CJ Router sources..."
  const sourcesAndMaybeFooter = content.slice(srcIdx + 2);

  const ftrIdx = sourcesAndMaybeFooter.indexOf(CJ_TIMING_SENTINEL);
  if (ftrIdx === -1) {
    return { mainText, sourcesText: sourcesAndMaybeFooter, footerText: '' };
  }

  return {
    mainText,
    sourcesText: sourcesAndMaybeFooter.slice(0, ftrIdx),
    // Skip the leading \n\n — footer starts with "---\n_CJ Router:..."
    footerText: sourcesAndMaybeFooter.slice(ftrIdx + 2),
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
