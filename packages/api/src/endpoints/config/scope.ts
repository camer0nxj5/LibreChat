import { logger } from '@librechat/data-schemas';
import { normalizeEndpointName } from 'librechat-data-provider';
import type { TModelsConfig } from 'librechat-data-provider';

/** Select catalogs before invoking provider integrations, keeping picker discovery unchanged. */
export function createModelProviderLoader(
  providers?: string[],
): (provider: string, load: () => Promise<string[]>) => Promise<string[]> {
  return async (provider: string, load: () => Promise<string[]>): Promise<string[]> => {
    if (providers && !providers.includes(provider)) {
      return [];
    }
    try {
      return await load();
    } catch (error) {
      logger.error(`Error fetching ${provider} models:`, error);
      return [];
    }
  };
}

/** Request-local memoization retains user/tenant/header isolation and model validation. */
export function createGenerationModelLoader(
  load: (providers: string[]) => Promise<TModelsConfig>,
): (provider: string) => Promise<TModelsConfig> {
  const pending = new Map<string, Promise<TModelsConfig>>();
  return (provider: string): Promise<TModelsConfig> => {
    const key = normalizeEndpointName(provider);
    const existing = pending.get(key);
    if (existing) {
      return existing;
    }
    const result = load([provider]);
    pending.set(key, result);
    return result;
  };
}
