import { tool } from '@langchain/core/tools';
import type { RunnableConfig } from '@langchain/core/runnables';
import { Constants } from 'librechat-data-provider';

type SearchResult = {
  title?: string;
  url: string;
  content: string;
  rerank_score?: number;
};

type CJSearchResponse = {
  success: boolean;
  results?: SearchResult[];
  timing?: Record<string, number>;
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
  return tool(
    async (input: { queries: string[]; intent?: string }, runnableConfig?: RunnableConfig) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs ?? 120_000);
      try {
        const response = await fetch(config.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
          },
          body: JSON.stringify({ queries: input.queries }),
          signal: controller.signal,
        });
        const payload = (await response.json()) as CJSearchResponse;
        if (!response.ok || !payload.success) {
          throw new Error(payload.error?.message ?? `CJ Router search failed (${response.status})`);
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
            outcome: `Returned ${organic.length} globally reranked web evidence items for: ${input.queries.join(' | ')}`,
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
