import { tool } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { Constants } from 'librechat-data-provider';

type SearchResult = {
  title?: string;
  url: string;
  content: string;
  rerank_score?: number;
  kb_answer_card?: boolean;
};

type CJSearchResponse = {
  success: boolean;
  results?: SearchResult[];
  timing?: Record<string, number>;
  kb_cards?: {
    card_ids?: string[];
    coverage?: Array<{ action?: string; coverage?: string; reason?: string }>;
    new_card_ids?: string[];
    search_round?: number;
    repeated_only?: boolean;
    web_search_cancelled?: boolean;
    cards_pinned_before_web?: boolean;
    cards_submitted_to_cohere?: boolean;
  };
  error?: { message?: string };
};

type SearchCallbacks = {
  onSearchResults?: (
    result: { success: boolean; data: Record<string, unknown> },
    config?: RunnableConfig,
  ) => void | Promise<void>;
};

type CJRouterSearchConfig = SearchCallbacks & {
  apiUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  searchMode?: 'basic' | 'advanced';
  useKbCards?: boolean;
  originalIntent?: string;
};

const EXPLICIT_WEB_SEARCH_PATTERN =
  /\b(?:search|browse|check|look)\s+(?:the\s+)?(?:web|internet|online)\b|\b(?:web|internet)\s+search\b|\blook\s+(?:it|this|that)\s+up\b/i;
const CURRENTNESS_PATTERN =
  /\b(?:latest|current|currently|today|newest|most recent|up[- ]to[- ]date|updated?|as of)\b/i;
const VOLATILE_SUBJECT_PATTERN =
  /\b(?:list|models?|releases?|versions?|prices?|pricing|rates?|rules?|laws?|limits?|eligibility|availability|products?|services?|specs?|specifications?|software|hardware|news|status|schedule|rankings?|benchmarks?)\b/i;
const META_AUDIT_PATTERN =
  /\b(?:why did|why does|why was|what did you mean|previous answer|your answer|you said|you mentioned|reference(?:d)?|explain your)\b/i;
const REFERENTIAL_FOLLOWUP_PATTERN =
  /^(?:please\s+)?(?:try again|update(?: this| it| the (?:answer|list))?|search (?:the )?(?:web|internet)(?: and update)?|look (?:it|this|that) up|check (?:the )?(?:web|internet)|give me the latest|use the latest)(?:[\s.!?].*)?$/i;

export function isCJRouterReferentialFollowup(text: string): boolean {
  return REFERENTIAL_FOLLOWUP_PATTERN.test(text.trim());
}

export function resolveCJRouterSearchIntent(
  currentText: string,
  priorUserTexts: string[] = [],
): string {
  const current = currentText.trim();
  if (!current || !isCJRouterReferentialFollowup(current)) {
    return current;
  }
  const prior = priorUserTexts
    .map((text) => text.trim())
    .find((text) => text && text !== current && !isCJRouterReferentialFollowup(text));
  return prior ? `Original request: ${prior}\nCurrent instruction: ${current}` : current;
}

export function buildCJRouterRequiredSearchContext(text: string): string {
  const value = text.trim();
  if (!value || META_AUDIT_PATTERN.test(value)) {
    return '';
  }
  const explicit = EXPLICIT_WEB_SEARCH_PATTERN.test(value);
  const currentInventory = CURRENTNESS_PATTERN.test(value) && VOLATILE_SUBJECT_PATTERN.test(value);
  if (!explicit && !currentInventory) {
    return '';
  }
  return [
    '# Required web-search action for this turn',
    'The user explicitly requested web verification or asked for current information about a changing subject.',
    'Invoke web_search before giving the final answer. Do not answer the current factual request from training knowledge alone.',
    'Use any verified local KB cards already supplied as evidence, but do not treat them as a substitute for the required current web check.',
  ].join('\n');
}


export type CJRouterKbPreload = {
  context: string;
  cardIds: string[];
  fullCoverage: boolean;
};

export async function preloadCJRouterKbCards(config: {
  apiUrl: string;
  apiKey?: string;
  timeoutMs?: number;
  originalIntent: string;
}): Promise<CJRouterKbPreload> {
  const originalIntent = config.originalIntent.trim();
  if (!originalIntent) {
    return { context: '', cardIds: [], fullCoverage: false };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 15_000);
  try {
    const response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        queries: [originalIntent],
        intent: originalIntent,
        use_kb_cards: true,
        lookup_only: true,
      }),
      signal: controller.signal,
    });
    const payload = (await response.json()) as CJSearchResponse;
    if (!response.ok || !payload.success) {
      throw new Error(payload.error?.message ?? `CJ Router KB preload failed (${response.status})`);
    }
    const cards = (payload.results ?? []).filter((result) => result.kb_answer_card === true);
    if (!cards.length) {
      return { context: '', cardIds: [], fullCoverage: false };
    }
    const coverage = payload.kb_cards?.coverage ?? [];
    const fullCoverage =
      coverage.length === cards.length &&
      coverage.length > 0 &&
      coverage.every((item) => item.action === 'kb_only');
    const context = [
      '# Verified local KB answer cards',
      fullCoverage
        ? 'These cards deterministically cover the complete original user question. Answer directly from them. Do not invoke web_search for this turn.'
        : 'The following cards were automatically retrieved for the original user question. Use them as verified evidence. If required facts are missing or current verification is necessary, invoke web_search.',
      ...cards.map(
        (result, index) =>
          `## KB Card ${index + 1}: ${result.title ?? 'Local KB answer card'}\nSource: ${result.url}\n${result.content}`,
      ),
    ].join('\n\n');
    return { context, cardIds: payload.kb_cards?.card_ids ?? [], fullCoverage };
  } finally {
    clearTimeout(timer);
  }
}

export function createCJRouterSearchTool(config: CJRouterSearchConfig): ReturnType<typeof tool> {
  let searchRound = 0;
  const returnedCardIds = new Set<string>();
  const searchMode = config.searchMode === 'basic' ? 'basic' : 'advanced';
  return tool(
    async (
      input: { query?: string; queries?: string[]; intent?: string },
      runnableConfig?: RunnableConfig,
    ) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 120_000);
      try {
        searchRound += 1;
        const queries = Array.isArray(input.queries)
          ? input.queries
          : typeof input.query === 'string'
            ? [input.query]
            : [];
        const response = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify({
            queries,
            intent: config.originalIntent?.trim() || input.intent,
            search_round: searchRound,
            previous_card_ids: Array.from(returnedCardIds),
            search_mode: searchMode,
            use_kb_cards: config.useKbCards === true,
          }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as CJSearchResponse;
        if (!response.ok || !payload.success) {
          throw new Error(payload.error?.message ?? `CJ Router search failed (${response.status})`);
        }
        for (const cardId of payload.kb_cards?.card_ids ?? []) {
          returnedCardIds.add(cardId);
        }
        const organic = (payload.results ?? []).map((result) => ({
          title: result.title ?? result.url,
          link: result.url,
          snippet: result.content,
          content: result.content,
          processed: true,
          highlights: [{ text: result.content, score: result.rerank_score ?? 0 }],
        }));
        const turn = Number(runnableConfig?.configurable?.turn ?? 0);
        const data = {
          turn,
          organic,
          topStories: [],
          images: [],
          videos: [],
          news: [],
          relatedSearches: [],
          references: organic.map((result) => ({
            link: result.link,
            title: result.title,
            type: 'link',
          })),
          cjRouterTiming: payload.timing,
          cjRouterKbCards: payload.kb_cards,
        };
        await config.onSearchResults?.({ success: true, data }, runnableConfig);
        const content = organic
          .map(
            (result, index) =>
              `\ue202turn${turn}search${index}\nTitle: ${result.title}\nURL: ${result.link}\n${result.content}`,
          )
          .join('\n\n');
        return [
          content || 'No relevant web results were returned.',
          {
            [Constants.WEB_SEARCH]: data,
            outcome: payload.kb_cards?.web_search_cancelled
              ? `Returned ${payload.kb_cards.card_ids?.length ?? 0} verified KB card(s); web search was cancelled because newly available cards fully covered the request.`
              : `Returned ${organic.length} evidence items${config.useKbCards ? ' (verified KB cards pinned first when relevant)' : ''} from ${searchMode} search for: ${queries.join(' | ')}`,
          },
        ];
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const data = { turn: Number(runnableConfig?.configurable?.turn ?? 0), organic: [], error: message };
        await config.onSearchResults?.({ success: false, data }, runnableConfig);
        return [
          `Web search failed: ${message}`,
          { [Constants.WEB_SEARCH]: data, outcome: `Web search failed: ${message}` },
        ];
      } finally {
        clearTimeout(timer);
      }
    },
    {
      name: 'web_search',
      description:
        searchMode === 'basic'
          ? 'Search the current web with one concise query. You may invoke web_search at most twice total in one user turn.'
          : 'Search the current web. Put every independently useful query for this search into the queries array; they run concurrently and are merged into one globally reranked evidence set. You may invoke web_search at most twice total in one user turn.',
      schema:
        searchMode === 'basic'
          ? {
              type: 'object',
              properties: {
                query: { type: 'string', description: 'The web query to run.' },
                intent: { type: 'string', description: 'Brief reason this search is needed.' },
              },
              required: ['query'],
            }
          : {
              type: 'object',
              properties: {
                queries: {
                  type: 'array',
                  items: { type: 'string' },
                  minItems: 1,
                  description: 'All web queries to run concurrently in this search invocation.',
                },
                intent: { type: 'string', description: 'Brief reason this search is needed.' },
              },
              required: ['queries'],
            },
      responseFormat: Constants.CONTENT_AND_ARTIFACT,
    },
  );
}
