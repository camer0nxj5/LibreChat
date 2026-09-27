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
};

export function createCJRouterSearchTool(config: CJRouterSearchConfig): ReturnType<typeof tool> {
  let searchRound = 0;
  const returnedCardIds = new Set<string>();
  return tool(
    async (input: { queries: string[]; intent?: string }, runnableConfig?: RunnableConfig) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 120_000);
      try {
        searchRound += 1;
        const response = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify({
            queries: input.queries,
            intent: input.intent,
            search_round: searchRound,
            previous_card_ids: Array.from(returnedCardIds),
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
              : `Returned ${organic.length} evidence items (verified KB cards pinned first, followed by globally reranked web evidence) for: ${input.queries.join(' | ')}`,
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
        'Search the current web. Put every independently useful query for this search into the queries array; they run concurrently and are merged into one globally reranked evidence set. You may invoke web_search at most twice total in one user turn.',
      schema: {
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
