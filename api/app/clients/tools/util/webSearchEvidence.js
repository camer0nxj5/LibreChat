const MIN_OVERLAP_TOKENS = 6;
const MIN_OVERLAP_CHARS = 48;

const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const canonicalizeUrl = (value) => {
  try {
    const url = new URL(value);
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) {
        url.searchParams.delete(key);
      }
    }
    const normalized = url.toString();
    return normalized.endsWith('/') ? normalized.slice(0, -1) : normalized;
  } catch {
    return String(value ?? '').trim();
  }
};

const tokensWithSpans = (text) => {
  const tokens = [];
  const regex = /\S+/g;
  let match;
  while ((match = regex.exec(text)) != null) {
    tokens.push({ value: match[0], start: match.index, end: regex.lastIndex });
  }
  return tokens;
};

/**
 * Conservatively joins A+B when a literal token suffix of A is the prefix of B.
 * The minimum prevents a coincidental short phrase from gluing unrelated passages.
 */
const mergeDirectionalOverlap = (left, right) => {
  const leftTokens = tokensWithSpans(left);
  const rightTokens = tokensWithSpans(right);
  const maximum = Math.min(leftTokens.length, rightTokens.length);
  for (let count = maximum; count >= MIN_OVERLAP_TOKENS; count -= 1) {
    const leftStart = leftTokens.length - count;
    let matches = true;
    for (let index = 0; index < count; index += 1) {
      if (leftTokens[leftStart + index].value !== rightTokens[index].value) {
        matches = false;
        break;
      }
    }
    if (!matches) {
      continue;
    }
    const overlapStart = leftTokens[leftStart].start;
    if (left.length - overlapStart < MIN_OVERLAP_CHARS) {
      continue;
    }
    if (count === rightTokens.length) {
      return left;
    }
    const novelRight = right.slice(rightTokens[count].start).trimStart();
    return `${left.trimEnd()} ${novelRight}`;
  }
  return null;
};

const mergeMetadata = (left, right) => {
  const seen = new Set();
  const lines = [];
  for (const line of `${left ?? ''}\n${right ?? ''}`.split('\n')) {
    const key = line.trim();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    lines.push(line);
  }
  return lines.length > 0 ? `\n${lines.join('\n')}` : '';
};

const mergePair = (left, right) => {
  const leftNormalized = normalizeText(left.text);
  const rightNormalized = normalizeText(right.text);
  const score = Math.max(left.score, right.score);
  const metadata = mergeMetadata(left.metadata, right.metadata);

  if (leftNormalized === rightNormalized || leftNormalized.includes(rightNormalized)) {
    return { merged: true, exact: leftNormalized === rightNormalized, value: { ...left, score, metadata } };
  }
  if (rightNormalized.includes(leftNormalized)) {
    return { merged: true, exact: false, value: { ...right, score, metadata } };
  }

  const forward = mergeDirectionalOverlap(left.text, right.text);
  if (forward != null) {
    return { merged: true, exact: false, value: { text: forward, score, metadata } };
  }
  const reverse = mergeDirectionalOverlap(right.text, left.text);
  if (reverse != null) {
    return { merged: true, exact: false, value: { text: reverse, score, metadata } };
  }
  return { merged: false };
};

const mergeHighlights = (highlights, stats) => {
  const merged = [];
  for (const original of highlights) {
    let candidate = original;
    let index = 0;
    while (index < merged.length) {
      const result = mergePair(merged[index], candidate);
      if (!result.merged) {
        index += 1;
        continue;
      }
      if (result.exact) {
        stats.exactDuplicatesRemoved += 1;
      } else {
        stats.overlapsMerged += 1;
      }
      candidate = result.value;
      merged.splice(index, 1);
      index = 0;
    }
    merged.push(candidate);
  }
  return merged;
};

const parseHighlight = (block) => {
  const match = block.match(
    /^### Highlight \d+ \[Relevance: ([^\]]+)\]\n\n```text\n([\s\S]*?)\n```([\s\S]*)$/,
  );
  if (!match) {
    return null;
  }
  const score = Number(match[1]);
  return {
    score: Number.isFinite(score) ? score : 0,
    text: match[2].trim(),
    metadata: match[3] ?? '',
  };
};

const formatHighlights = (highlights) =>
  highlights
    .map((highlight, index) => {
      const score = Number.isFinite(highlight.score) ? highlight.score.toFixed(2) : '0.00';
      return `### Highlight ${index + 1} [Relevance: ${score}]\n\n\`\`\`text\n${highlight.text.trim()}\n\`\`\`${highlight.metadata ?? ''}`.trimEnd();
    })
    .join('\n\n---\n\n');

const transformSourceSegment = (segment, state, stats) => {
  const marker = '\n## Highlights\n\n';
  const markerIndex = segment.indexOf(marker);
  if (markerIndex < 0) {
    return segment;
  }
  const prefix = segment.slice(0, markerIndex + marker.length);
  const trailingLineBreaks = segment.match(/(?:\r?\n)+$/)?.[0] ?? '\n\n';
  const rawHighlightText = segment.slice(markerIndex + marker.length).trim();
  const highlights = rawHighlightText
    .split(/\n---\n\n(?=### Highlight \d+ )/)
    .map(parseHighlight)
    .filter(Boolean);
  if (highlights.length === 0) {
    return segment;
  }

  const urlMatch = prefix.match(/^URL: (.+)$/m);
  const sourceKey = canonicalizeUrl(urlMatch?.[1] ?? prefix.split('\n', 1)[0]);
  const seen = state.seenBySource.get(sourceKey) ?? new Set();
  const retained = [];
  for (const highlight of mergeHighlights(highlights, stats)) {
    const fingerprint = normalizeText(highlight.text);
    if (seen.has(fingerprint)) {
      stats.crossCallDuplicatesRemoved += 1;
      continue;
    }
    seen.add(fingerprint);
    retained.push(highlight);
  }
  state.seenBySource.set(sourceKey, seen);

  if (retained.length === 0) {
    return `${prefix.replace(marker, '\n').trimEnd()}${trailingLineBreaks}`;
  }
  return `${prefix}${formatHighlights(retained)}${trailingLineBreaks}`;
};

const transformNativeWebSearchEvidence = (output, state = createWebSearchEvidenceState()) => {
  const stats = {
    exactDuplicatesRemoved: 0,
    overlapsMerged: 0,
    crossCallDuplicatesRemoved: 0,
    charsBefore: output.length,
    charsAfter: output.length,
  };
  /** Treat every top-level result/section heading as a boundary. This keeps
   * answer boxes, knowledge graphs, and People Also Ask content outside the
   * final source's highlight metadata. */
  const headerRegex = /^(?:# (?:Search|News) \d+:.*|=== .+ ===)$/gm;
  const matches = [...output.matchAll(headerRegex)];
  if (matches.length === 0) {
    return { output, stats };
  }

  let cursor = 0;
  const parts = [];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index;
    const nextStart = matches[index + 1]?.index ?? output.length;
    parts.push(output.slice(cursor, start));
    const segment = output.slice(start, nextStart);
    parts.push(/^# (?:Search|News) \d+:/.test(segment) ? transformSourceSegment(segment, state, stats) : segment);
    cursor = nextStart;
  }
  parts.push(output.slice(cursor));
  const transformed = parts.join('');
  stats.charsAfter = transformed.length;
  return { output: transformed, stats };
};

const createWebSearchEvidenceState = () => ({ seenBySource: new Map() });

const wrapNativeWebSearchTool = (searchTool, state, logger) => {
  if (searchTool == null || typeof searchTool.func !== 'function') {
    return searchTool;
  }
  const original = searchTool.func;
  searchTool.func = async (...args) => {
    const result = await original(...args);
    if (!Array.isArray(result) || typeof result[0] !== 'string') {
      return result;
    }
    const transformed = transformNativeWebSearchEvidence(result[0], state);
    if (
      transformed.stats.exactDuplicatesRemoved > 0 ||
      transformed.stats.overlapsMerged > 0 ||
      transformed.stats.crossCallDuplicatesRemoved > 0
    ) {
      logger?.info?.('[web-search-evidence] consolidated highlights', transformed.stats);
    }
    return [transformed.output, result[1]];
  };
  return searchTool;
};

module.exports = {
  createWebSearchEvidenceState,
  transformNativeWebSearchEvidence,
  wrapNativeWebSearchTool,
};
