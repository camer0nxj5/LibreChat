import { memo, useId, useMemo, useState } from "react";
import { ChevronDown, Globe2, Loader2 } from "lucide-react";
import { useLocalize } from "~/hooks";
import Markdown from "./Markdown";

const SOURCE_HEADING_RE =
  /^[ \t]*(?:#{1,6}[ \t]*)?(?:\*\*|__)?(?:sources|references|citations|bibliography)(?:\*\*|__)?[ \t]*:?(?:\*\*|__)?[ \t]*(.*)$/i;
const SOURCE_ENTRY_RE = /^[ \t]*(?:[-*][ \t]+|\d+[.)][ \t]+|\[\d+\][ \t]*).+/;
const SOURCE_EVIDENCE_RE = /https?:\/\/|\((?:PRIMARY|SECONDARY|WEAK)\)/i;
const BIBLIOGRAPHY_NUMBER_RE =
  /^[ \t]*(?:\[(\d+)\]|(\d+)[.)])[ \t]+(.+?)[ \t]*$/;
const BIBLIOGRAPHY_RANGE_RE =
  /^[ \t]*\[?(\d+)[ \t]*[-–—][ \t]*(\d+)\]?[.)]?[ \t]+(?:additional|other|remaining)[ \t]+(?:(?:primary|secondary|weak|and)[ \t]+)*sources(?:[ \t]+(?:as[ \t]+)?listed[ \t]+in[ \t]+(?:the[ \t]+)?evidence)?[.!]?[ \t]*$/i;

const CJ_STATUS_RE = /\ue000CJ_ROUTER_STATUS:({.*?})\ue001/g;

type CJRouterStatus = { stage?: string; label?: string; query?: string };

export function parseCJRouterStatuses(content: string): {
  cleanText: string;
  statuses: CJRouterStatus[];
} {
  const statuses: CJRouterStatus[] = [];
  const cleanText = content.replace(CJ_STATUS_RE, (_match, raw) => {
    try {
      const parsed = JSON.parse(raw) as CJRouterStatus;
      if (parsed && typeof parsed === "object") statuses.push(parsed);
    } catch {
      // Ignore malformed status markers and hide them from the transcript.
    }
    return "";
  });
  return { cleanText, statuses };
}

function latestStatusLabel(statuses: CJRouterStatus[]): string {
  const latest = statuses[statuses.length - 1];
  if (!latest) return "Searching web";
  if (typeof latest.label === "string" && latest.label.trim()) return latest.label.trim();
  return "Searching web";
}

function CJRouterStatusRow({ label }: { label: string }) {
  return (
    <div className="relative my-1.5 flex h-5 shrink-0 items-center gap-2.5 text-sm text-text-secondary">
      <span className="flex h-5 min-w-6 shrink-0 items-center justify-center">
        <span className="relative flex h-4 w-4 items-center justify-center">
          <Globe2 className="h-4 w-4" aria-hidden="true" />
          <Loader2 className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-spin" aria-hidden="true" />
        </span>
      </span>
      <span>{label}</span>
    </div>
  );
}

function sourceHeading(line: string): string | null {
  const match = line.match(SOURCE_HEADING_RE);
  if (!match) return null;
  const inline = match[1].trim();
  return !inline || SOURCE_ENTRY_RE.test(inline) || /^https?:\/\//.test(inline)
    ? inline
    : null;
}

function isPublisherTitleSource(body: string): {
  sourceLike: boolean;
  strong: boolean;
} {
  const parts = body.split(/[ \t]+[-–—][ \t]+/);
  if (parts.length < 2) {
    return { sourceLike: false, strong: false };
  }
  const publisher = parts[0].trim();
  const title = parts.slice(1).join(" - ").trim();
  const publisherShape =
    /^[A-Z][\w .&’'-]{0,60}$/.test(publisher) &&
    publisher.split(/\s+/).length <= 6;
  const quotedTitle = /^["“].+["”]$/.test(title);
  const titleWords = title.replace(/["“”]/g, "").trim().split(/\s+/).length;
  const sourceLike = publisherShape && titleWords >= 3;
  return { sourceLike, strong: sourceLike && quotedTitle };
}

function stripTrailingBibliography(text: string): string {
  const lines = text.split(/(?<=\n)/);
  let start = lines.length;
  let entries = 0;
  let sourceLikeEntries = 0;
  let strong = false;

  for (let index = lines.length - 1; index >= 0; index--) {
    const line = lines[index].trim();
    if (!line) {
      start = index;
      continue;
    }

    const rangeMatch = line.match(BIBLIOGRAPHY_RANGE_RE);
    if (rangeMatch && Number(rangeMatch[1]) < Number(rangeMatch[2])) {
      start = index;
      continue;
    }

    const numberMatch = line.match(BIBLIOGRAPHY_NUMBER_RE);
    if (!numberMatch) break;

    const body = numberMatch[3];
    const evidence =
      SOURCE_EVIDENCE_RE.test(body) || /^https?:\/\//i.test(body);
    const publisherTitle = isPublisherTitleSource(body);
    if (!evidence && !publisherTitle.sourceLike) break;

    entries++;
    if (publisherTitle.sourceLike) sourceLikeEntries++;
    strong = strong || evidence || publisherTitle.strong;
    start = index;
  }

  if (entries === 0 || !strong || (entries < 2 && sourceLikeEntries < 2)) {
    return text;
  }

  const prefix = lines.slice(0, start).join("");
  if (!prefix.trim()) return text;
  return prefix.trimEnd();
}

export function stripModelSourceSection(text: string): string {
  const lines = text.split("\n");
  const kept: string[] = [];
  let fence: string | null = null;
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    const marker = line.trim().match(/^(```|~~~)/)?.[1];
    if (marker)
      fence = fence === marker ? null : fence === null ? marker : fence;
    const candidate =
      sourceHeading(line) !== null ||
      (/^[ \t]*\[\d+\]/.test(line) && SOURCE_EVIDENCE_RE.test(line));
    if (fence === null && candidate && kept.join("\n").trim()) {
      let end = index;
      let entries = 0;
      let headed = false;
      while (end < lines.length) {
        const item = lines[end];
        const heading = sourceHeading(item);
        if (!item.trim()) {
          end++;
          continue;
        }
        if (heading !== null) {
          headed = true;
          entries += heading ? 1 : 0;
        } else if (
          SOURCE_ENTRY_RE.test(item) &&
          (headed || SOURCE_EVIDENCE_RE.test(item))
        ) {
          entries++;
        } else {
          break;
        }
        end++;
      }
      if (entries > 0) {
        index = end;
        continue;
      }
    }
    kept.push(line);
    index++;
  }
  return stripTrailingBibliography(kept.join("\n").trimEnd());
}

export interface CJFooterParts {
  mainText: string;
  sourcesText: string; // "CJ Router sources relied upon:\n1. SECONDARY: [Title](url)..."
  footerText: string; // "---\n_CJ Router: Model: X | Time: Y_"
}

const SOURCES_MARKER = "CJ Router sources relied upon:";
const FOOTER_RE = /(?:^|\n)[ \t]*---[ \t]*\n\s*_CJ Router: Model:/;

/** Accept both web-research sources and the stats-only footer on ordinary chat. */
export function parseCJFooter(content: string): CJFooterParts | null {
  const text = content.replace(/\r\n?/g, "\n");
  const srcIdx = text.indexOf(SOURCES_MARKER);
  const footerMatch = FOOTER_RE.exec(text);
  const ftrIdx = footerMatch?.index ?? -1;
  if (srcIdx === -1 && ftrIdx === -1) return null;
  const mainEnd = srcIdx >= 0 ? srcIdx : ftrIdx;
  return {
    mainText: text.slice(0, mainEnd).trimEnd(),
    sourcesText:
      srcIdx >= 0
        ? text.slice(srcIdx, ftrIdx >= srcIdx ? ftrIdx : undefined).trimEnd()
        : "",
    footerText: ftrIdx >= 0 ? text.slice(ftrIdx).trim() : "",
  };
}

export const CJRouterMessage = memo(function CJRouterMessage({
  content,
  isLatestMessage,
}: {
  content: string;
  isLatestMessage: boolean;
}) {
  const parsedStatus = useMemo(() => parseCJRouterStatuses(content), [content]);
  const parts = useMemo(() => parseCJFooter(parsedStatus.cleanText), [parsedStatus.cleanText]);
  const hasAnswerText = parsedStatus.cleanText.trim().length > 0;
  const showStatus = parsedStatus.statuses.length > 0 && isLatestMessage && !hasAnswerText;
  return (
    <>
      {showStatus && <CJRouterStatusRow label={latestStatusLabel(parsedStatus.statuses)} />}
      {parts ? (
        <CJRouterFooter {...parts} isLatestMessage={isLatestMessage} />
      ) : hasAnswerText ? (
        <Markdown content={parsedStatus.cleanText} isLatestMessage={isLatestMessage} />
      ) : null}
    </>
  );
});

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
  const panelId = useId();
  const localize = useLocalize();
  const cleanMain = useMemo(
    () =>
      sourcesText.length > 0 ? stripModelSourceSection(mainText) : mainText,
    [mainText, sourcesText],
  );
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
            aria-controls={panelId}
          >
            <ChevronDown
              className={`h-3 w-3 flex-shrink-0 transition-transform duration-200 motion-reduce:transition-none${open ? " rotate-180" : ""}`}
              aria-hidden="true"
            />
            {localize("com_sources_title")}
            {sourceCount > 0 ? ` (${sourceCount})` : ""}
          </button>
          {open && (
            <div
              id={panelId}
              className="mt-1 border-l-2 border-border-light pl-3"
            >
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

CJRouterFooter.displayName = "CJRouterFooter";
export default CJRouterFooter;
