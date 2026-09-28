import { librechat } from 'librechat-data-provider';
import type { DynamicSettingProps, ImageDetail } from 'librechat-data-provider';

type LibreChatKeys = keyof typeof librechat;

type LibreChatParams = {
  modelOptions: Omit<NonNullable<DynamicSettingProps['conversation']>, LibreChatKeys>;
  resendFiles: boolean;
  promptPrefix?: string | null;
  maxContextTokens?: number;
  fileTokenLimit?: number;
  modelLabel?: string | null;
  imageDetail?: ImageDetail;
};

/**
 * Separates LibreChat-specific parameters from model options
 * @param options - The combined options object
 */
export function extractLibreChatParams(
  options?: DynamicSettingProps['conversation'],
  parameterDefinitions: Array<{ key: string; type?: string; options?: string[] }> = [],
): LibreChatParams {
  if (!options) {
    return {
      modelOptions: {} as Omit<NonNullable<DynamicSettingProps['conversation']>, LibreChatKeys>,
      resendFiles: librechat.resendFiles.default as boolean,
    };
  }

  const modelOptions = { ...options };

  /** Custom endpoints can narrow an enum exposed by the shared OpenAI-style
   * controls. Drop stale browser values that are outside the endpoint's declared
   * options instead of forwarding a provider-invalid request. */
  for (const definition of parameterDefinitions) {
    if (
      definition.type !== 'enum' ||
      !Array.isArray(definition.options) ||
      definition.options.length === 0
    ) {
      continue;
    }
    const value = modelOptions[definition.key as keyof typeof modelOptions];
    if (value != null && !definition.options.includes(String(value))) {
      delete modelOptions[definition.key as keyof typeof modelOptions];
    }
  }

  const resendFiles =
    (delete modelOptions.resendFiles, options.resendFiles) ??
    (librechat.resendFiles.default as boolean);
  const promptPrefix = (delete modelOptions.promptPrefix, options.promptPrefix);
  const maxContextTokens = (delete modelOptions.maxContextTokens, options.maxContextTokens);
  const fileTokenLimit = (delete modelOptions.fileTokenLimit, options.fileTokenLimit);
  const modelLabel = (delete modelOptions.modelLabel, options.modelLabel);
  const imageDetail = (delete modelOptions.imageDetail, options.imageDetail);

  return {
    modelOptions: modelOptions as Omit<
      NonNullable<DynamicSettingProps['conversation']>,
      LibreChatKeys
    >,
    maxContextTokens,
    fileTokenLimit,
    promptPrefix,
    resendFiles,
    modelLabel,
    imageDetail,
  };
}
