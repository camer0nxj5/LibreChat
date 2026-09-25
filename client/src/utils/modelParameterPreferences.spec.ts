import type { TConversation } from 'librechat-data-provider';
import { applyModelParameterPreferences, getModelParameterPreferenceKey } from './modelParameterPreferences';

describe('model parameter preferences', () => {
  beforeEach(() => localStorage.clear());

  it('applies saved parameters synchronously to a new conversation', () => {
    localStorage.setItem(
      getModelParameterPreferenceKey('oMLX', 'Qwen3.6-35B-A3B-4bit'),
      JSON.stringify({ disable_thinking: true, reasoning_effort: 'none' }),
    );
    const result = applyModelParameterPreferences({
      conversationId: 'new', endpoint: 'oMLX', model: 'Qwen3.6-35B-A3B-4bit',
    } as TConversation);
    expect(result.disable_thinking).toBe(true);
    expect(result.reasoning_effort).toBe('none');
  });

  it('does not override parameters explicitly supplied by a template or preset', () => {
    localStorage.setItem(
      getModelParameterPreferenceKey('oMLX', 'Qwen3.6-35B-A3B-4bit'),
      JSON.stringify({ disable_thinking: true }),
    );
    const result = applyModelParameterPreferences(
      { conversationId: 'new', endpoint: 'oMLX', model: 'Qwen3.6-35B-A3B-4bit' } as TConversation,
      { disable_thinking: false } as Partial<TConversation>,
    );
    expect(result.disable_thinking).toBe(false);
  });

  it('ignores malformed saved data', () => {
    localStorage.setItem(getModelParameterPreferenceKey('oMLX', 'Qwen3.6-35B-A3B-4bit'), '{');
    const conversation = {
      conversationId: 'new', endpoint: 'oMLX', model: 'Qwen3.6-35B-A3B-4bit',
    } as TConversation;
    expect(applyModelParameterPreferences(conversation)).toEqual(conversation);
  });
});
