import {
  buildCJRouterRequiredSearchContext,
  isCJRouterReferentialFollowup,
  resolveCJRouterSearchIntent,
} from './cjRouterWebSearch';

describe('CJ Router search-intent policy', () => {
  it('requires web search for an explicit search request', () => {
    expect(
      buildCJRouterRequiredSearchContext(
        'Search the internet and update this list with the latest models',
      ),
    ).toContain('Invoke web_search before giving the final answer');
  });

  it('requires web search for current volatile inventories', () => {
    expect(
      buildCJRouterRequiredSearchContext(
        'Give me the latest list of models with 40B to 100B total parameters',
      ),
    ).toContain('Required web-search action');
  });

  it('does not force search for meta questions about a previous answer', () => {
    expect(
      buildCJRouterRequiredSearchContext(
        'Why did your previous answer reference the latest release?',
      ),
    ).toBe('');
  });

  it('resolves a referential update against the prior substantive request', () => {
    const resolved = resolveCJRouterSearchIntent('Update this list with the latest info', [
      'Update this list with the latest info',
      'Give me a list of LLMs with between 40 billion and 100 billion total parameters',
    ]);
    expect(isCJRouterReferentialFollowup('Update this list with the latest info')).toBe(true);
    expect(resolved).toContain('40 billion and 100 billion total parameters');
    expect(resolved).toContain('Current instruction: Update this list');
  });
});
