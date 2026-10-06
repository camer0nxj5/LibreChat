import { logger } from '@librechat/data-schemas';
import { EModelEndpoint } from 'librechat-data-provider';
import type { TModelsConfig } from 'librechat-data-provider';
import type {
  getAnthropicModels,
  getBedrockModels,
  getOpenAIModels,
  getGoogleModels,
} from '../models';
import type { LoadConfigModelsDeps } from './models';
import type { ServerRequest } from '~/types';
import { getAppConfigOptionsFromUser } from '~/app/service';
import { createModelProviderLoader } from './scope';
import { mergeHeaders } from '~/utils/headers';

interface DefaultModelsDeps {
  getAppConfig: LoadConfigModelsDeps['getAppConfig'];
  getAnthropicModels: typeof getAnthropicModels;
  getBedrockModels: typeof getBedrockModels;
  getOpenAIModels: typeof getOpenAIModels;
  getGoogleModels: typeof getGoogleModels;
}

export function createLoadDefaultModels(
  deps: DefaultModelsDeps,
): (req: ServerRequest, providers?: string[]) => Promise<TModelsConfig> {
  const { getAppConfig, getAnthropicModels, getBedrockModels, getOpenAIModels, getGoogleModels } =
    deps;
  /**
   * Loads the default models for the application.
   * @async
   * @function
   * @param {ServerRequest} req - The Express request object.
   */
  return async function loadDefaultModels(
    req: ServerRequest,
    providers?: string[],
  ): Promise<TModelsConfig> {
    try {
      const appConfig = req.config ?? (await getAppConfig(getAppConfigOptionsFromUser(req.user)));
      const vertexConfig = appConfig?.endpoints?.[EModelEndpoint.anthropic]?.vertexConfig;

      /** Forward configured custom headers (endpoint over global `all`) so model
       *  fetches reach a gateway-fronted provider the same as chat requests. */
      const allHeaders = appConfig?.endpoints?.all?.headers;
      const openAIHeaders = mergeHeaders(
        allHeaders,
        appConfig?.endpoints?.[EModelEndpoint.openAI]?.headers,
      );
      const anthropicHeaders = mergeHeaders(
        allHeaders,
        appConfig?.endpoints?.[EModelEndpoint.anthropic]?.headers,
      );

      const load = createModelProviderLoader(providers);
      const [openAI, anthropic, azureOpenAI, assistants, azureAssistants, google, bedrock] =
        await Promise.all([
          load(EModelEndpoint.openAI, () =>
            getOpenAIModels({ user: req.user?.id, headers: openAIHeaders, userObject: req.user }),
          ),
          load(EModelEndpoint.anthropic, () =>
            getAnthropicModels({
              user: req.user?.id,
              vertexModels: vertexConfig?.modelNames,
              headers: anthropicHeaders,
              userObject: req.user,
            }),
          ),
          load(EModelEndpoint.azureOpenAI, () =>
            getOpenAIModels({ user: req.user?.id, azure: true }),
          ),
          load(EModelEndpoint.assistants, () => getOpenAIModels({ assistants: true })),
          load(EModelEndpoint.azureAssistants, () =>
            getOpenAIModels({ azure: true, assistants: true }),
          ),
          load(EModelEndpoint.google, () => Promise.resolve(getGoogleModels())),
          load(EModelEndpoint.bedrock, () => Promise.resolve(getBedrockModels())),
        ]);

      return {
        [EModelEndpoint.openAI]: openAI,
        [EModelEndpoint.google]: google,
        [EModelEndpoint.anthropic]: anthropic,
        [EModelEndpoint.azureOpenAI]: azureOpenAI,
        [EModelEndpoint.assistants]: assistants,
        [EModelEndpoint.azureAssistants]: azureAssistants,
        [EModelEndpoint.bedrock]: bedrock,
      };
    } catch (error) {
      logger.error('Error fetching default models:', error);
      throw new Error(
        `Failed to load default models: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };
}
