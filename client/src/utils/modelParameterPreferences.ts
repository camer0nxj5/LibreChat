import type { TConversation } from 'librechat-data-provider';

const MODEL_PARAMETER_PREFERENCES = 'librechat-model-parameters:';

export function getModelParameterPreferenceKey(provider?: string | null, model?: string | null) {
  if (!provider || !model) return '';
  return MODEL_PARAMETER_PREFERENCES + encodeURIComponent(provider) + ':' + encodeURIComponent(model);
}

export function readModelParameterPreferences(
  provider?: string | null,
  model?: string | null,
): Record<string, unknown> {
  const preferenceKey = getModelParameterPreferenceKey(provider, model);
  if (!preferenceKey || typeof localStorage === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(preferenceKey) ?? '{}') as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function applyModelParameterPreferences(
  conversation: TConversation,
  explicitValues: Partial<TConversation> = {},
): TConversation {
  const preferences = readModelParameterPreferences(conversation.endpoint, conversation.model);
  if (Object.keys(preferences).length === 0) return conversation;
  const next = { ...conversation } as TConversation & Record<string, unknown>;
  for (const [key, value] of Object.entries(preferences)) {
    if (!Object.prototype.hasOwnProperty.call(explicitValues, key)) next[key] = value;
  }
  return next;
}
