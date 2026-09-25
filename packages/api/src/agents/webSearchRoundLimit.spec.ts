import type { PostToolBatchHookInput, PreToolUseHookInput } from '@librechat/agents';
import {
  createWebSearchCallLimitHooks,
  createWebSearchRoundLimitHooks,
} from './webSearchRoundLimit';

const signal = new AbortController().signal;

function pre(toolName = 'web_search'): PreToolUseHookInput {
  return { hook_event_name: 'PreToolUse', toolName, toolInput: {}, toolUseId: 'call-1' } as PreToolUseHookInput;
}

function batch(toolNames: string[], agentId?: string): PostToolBatchHookInput {
  return {
    hook_event_name: 'PostToolBatch',
    runId: 'run-1',
    ...(agentId != null && { agentId }),
    entries: toolNames.map((toolName, index) => ({
      toolName,
      toolInput: {},
      toolUseId: `call-${index}`,
      status: 'success',
    })),
  } as PostToolBatchHookInput;
}

describe('web-search round limit', () => {
  it('counts a parallel search batch as one round', async () => {
    const hooks = createWebSearchRoundLimitHooks(2);
    await expect(
      hooks.postToolBatch(batch(['web_search', 'web_search', 'web_search']), signal),
    ).resolves.toEqual(expect.objectContaining({
      additionalContext: expect.stringContaining('1 web-search round remains'),
    }));
    await expect(hooks.preToolUse(pre(), signal)).resolves.toEqual({});
  });

  it('denies web search after the configured number of completed rounds', async () => {
    const hooks = createWebSearchRoundLimitHooks(2);
    await hooks.postToolBatch(batch(['web_search']), signal);
    await hooks.postToolBatch(batch(['web_search', 'web_search']), signal);
    await expect(hooks.preToolUse(pre(), signal)).resolves.toEqual({
      decision: 'deny',
      reason: expect.stringContaining('limit of 2 web-search rounds'),
    });
  });

  it('does not block other tools after the search limit', async () => {
    const hooks = createWebSearchRoundLimitHooks(1);
    await hooks.postToolBatch(batch(['web_search']), signal);
    await expect(hooks.preToolUse(pre('calculator'), signal)).resolves.toEqual({});
  });

  it('ignores child-agent and non-search batches', async () => {
    const hooks = createWebSearchRoundLimitHooks(1);
    await hooks.postToolBatch(batch(['web_search'], 'child'), signal);
    await hooks.postToolBatch(batch(['calculator']), signal);
    await expect(hooks.preToolUse(pre(), signal)).resolves.toEqual({});
  });
});

describe('web-search call limit', () => {
  it('allows two calls and denies the third even when calls share a batch', async () => {
    const hooks = createWebSearchCallLimitHooks(2);
    await expect(hooks.preToolUse(pre(), signal)).resolves.toEqual({});
    await expect(hooks.preToolUse(pre(), signal)).resolves.toEqual({});
    await expect(hooks.preToolUse(pre(), signal)).resolves.toEqual({
      decision: 'deny',
      reason: expect.stringContaining('limit of 2 web searches'),
    });
  });

  it('does not count other tools', async () => {
    const hooks = createWebSearchCallLimitHooks(1);
    await expect(hooks.preToolUse(pre('calculator'), signal)).resolves.toEqual({});
    await expect(hooks.preToolUse(pre(), signal)).resolves.toEqual({});
  });
});
