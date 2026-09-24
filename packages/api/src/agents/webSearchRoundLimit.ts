import type { HookCallback } from '@librechat/agents';

const WEB_SEARCH_TOOL_NAME = 'web_search';

export interface WebSearchRoundLimitHooks {
  preToolUse: HookCallback<'PreToolUse'>;
  postToolBatch: HookCallback<'PostToolBatch'>;
}

/** Enforces a per-run limit while counting concurrent searches as one round. */
export function createWebSearchRoundLimitHooks(maxRounds: number): WebSearchRoundLimitHooks {
  let completedRounds = 0;

  const preToolUse: HookCallback<'PreToolUse'> = async (input) => {
    if (input.toolName !== WEB_SEARCH_TOOL_NAME || completedRounds < maxRounds) {
      return {};
    }
    return {
      decision: 'deny',
      reason: `The configured limit of ${maxRounds} web-search rounds has been reached. Do not search again; answer now using the evidence already gathered and briefly identify any unresolved gap.`,
    };
  };

  const postToolBatch: HookCallback<'PostToolBatch'> = async (input) => {
    if (
      input.agentId != null ||
      !input.entries.some((entry) => entry.toolName === WEB_SEARCH_TOOL_NAME)
    ) {
      return {};
    }

    completedRounds += 1;
    const remaining = Math.max(0, maxRounds - completedRounds);
    if (remaining === 0) {
      return {
        additionalContext: `System notice: you have completed the configured maximum of ${maxRounds} web-search rounds. Do not call web_search again. Close your reasoning and provide the final answer now from the evidence already gathered; briefly identify any unresolved gap.`,
      };
    }
    return {
      additionalContext: `System notice: ${remaining} web-search round remains. If more evidence is essential, issue all needed web_search calls concurrently in that one round; otherwise answer now.`,
    };
  };

  return { preToolUse, postToolBatch };
}
