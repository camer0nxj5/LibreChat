import { buildWebSearchContext, buildWebSearchDynamicContext } from './web';

jest.mock('librechat-data-provider', () => ({
  Tools: { web_search: 'web_search' },
}));

describe('web search context', () => {
  it('keeps static context free of volatile date replacements', () => {
    const context = buildWebSearchContext();

    expect(context).toContain('web_search');
    expect(context).not.toContain('Current Date:');
  });

  it('guides the model to answer directly when a search is not warranted', () => {
    const context = buildWebSearchContext();

    expect(context).toContain('respond directly without searching');
    expect(context).toContain('current, real-time, or otherwise beyond your own knowledge');
  });

  it('keeps runtime context stable across turns on the same day', () => {
    const context = buildWebSearchDynamicContext('2024-01-02T03:04:05.000Z');
    const secondContext = buildWebSearchDynamicContext('2024-01-02T22:59:59.999Z');

    expect(context).toBe(
      '# `web_search` Runtime Context\nCurrent Date: 2024-01-02',
    );
    expect(secondContext).toBe(context);
  });

  it('changes runtime context when the UTC date changes', () => {
    expect(buildWebSearchDynamicContext('2024-01-03T00:00:00.000Z')).toContain(
      'Current Date: 2024-01-03',
    );
  });
});
