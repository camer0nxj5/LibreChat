const {
  createLoadDefaultModels,
  getAnthropicModels,
  getBedrockModels,
  getOpenAIModels,
  getGoogleModels,
} = require('@librechat/api');
const { getAppConfig } = require('./app');

module.exports = createLoadDefaultModels({
  getAppConfig,
  getAnthropicModels,
  getBedrockModels,
  getOpenAIModels,
  getGoogleModels,
});
