const {
  createWebSearchEvidenceState,
  transformNativeWebSearchEvidence,
  wrapNativeWebSearchTool,
} = require('./webSearchEvidence');

const source = (url, highlights) => `=== Web Results, Turn 0 ===

# Search 0: "Example"

Anchor: turn0search0
URL: ${url}
Summary: Example summary

## Highlights

${highlights
  .map(
    (text, index) => `### Highlight ${index + 1} [Relevance: 0.${9 - index}0]

\`\`\`text
${text}
\`\`\``,
  )
  .join('\n\n---\n\n')}
`;

describe('native web-search evidence consolidation', () => {
  test('removes exact highlights after whitespace normalization', () => {
    const input = source('https://example.com/a', ['alpha   beta gamma', 'alpha beta gamma']);
    const result = transformNativeWebSearchEvidence(input);
    expect(result.stats.exactDuplicatesRemoved).toBe(1);
    expect(result.output.match(/^### Highlight/gm)).toHaveLength(1);
  });

  test('losslessly merges literal suffix/prefix overlap', () => {
    const overlap = 'eight literal overlap tokens remain exactly the same here';
    const left = `Opening material before ${overlap}`;
    const right = `${overlap} followed by new material at the end`;
    const result = transformNativeWebSearchEvidence(source('https://example.com/a', [left, right]));
    expect(result.stats.overlapsMerged).toBe(1);
    expect(result.output).toContain(
      `Opening material before ${overlap} followed by new material at the end`,
    );
    expect(result.output.match(/^### Highlight/gm)).toHaveLength(1);
  });

  test('preserves distinct excerpts from the same URL', () => {
    const result = transformNativeWebSearchEvidence(
      source('https://example.com/a', [
        'This passage discusses one independent specification in complete detail.',
        'A separate passage describes pricing and availability using different facts.',
      ]),
    );
    expect(result.output.match(/^### Highlight/gm)).toHaveLength(2);
  });

  test('removes the same URL and excerpt on a later search call', () => {
    const state = createWebSearchEvidenceState();
    const first = transformNativeWebSearchEvidence(
      source('https://example.com/a?utm_source=test', ['A sufficiently long exact excerpt.']),
      state,
    );
    const second = transformNativeWebSearchEvidence(
      source('https://example.com/a', ['A sufficiently long exact excerpt.']),
      state,
    );
    expect(first.output).toContain('A sufficiently long exact excerpt.');
    expect(second.stats.crossCallDuplicatesRemoved).toBe(1);
    expect(second.output).not.toContain('A sufficiently long exact excerpt.');
    expect(second.output).toContain('URL: https://example.com/a');
  });

  test('wraps model content without changing the citation artifact', async () => {
    const artifact = { web_search: { organic: [{ link: 'https://example.com/a' }] } };
    const tool = {
      func: async () => [
        source('https://example.com/a', ['same excerpt', 'same excerpt']),
        artifact,
      ],
    };
    wrapNativeWebSearchTool(tool, createWebSearchEvidenceState());
    const result = await tool.func({ query: 'test' });
    expect(result[0].match(/^### Highlight/gm)).toHaveLength(1);
    expect(result[1]).toBe(artifact);
  });

  test('does not absorb a following answer-box section into highlight metadata', () => {
    const input = `${source('https://example.com/a', ['same excerpt', 'same excerpt'])}\n=== Answer Box ===\n\n**Title:** Separate answer`;
    const result = transformNativeWebSearchEvidence(input);
    expect(result.output).toContain('=== Answer Box ===\n\n**Title:** Separate answer');
    expect(result.output.match(/^### Highlight/gm)).toHaveLength(1);
  });

  test('keeps consecutive result headings on separate lines', () => {
    const first = source('https://example.com/a', ['same excerpt', 'same excerpt']);
    const second = source('https://example.com/b', ['different excerpt'])
      .replace('=== Web Results, Turn 0 ===\n\n', '')
      .replace('# Search 0:', '# Search 1:');
    const result = transformNativeWebSearchEvidence(`${first}${second}`);
    expect(result.output.match(/^# Search \d+:/gm)).toHaveLength(2);
    expect(result.output).not.toContain('```# Search');
  });
});
