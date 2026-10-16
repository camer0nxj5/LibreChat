import path from 'node:path';
import { defineConfig } from '@playwright/test';
import mockConfig from './playwright.config.mock';

const servers = (Array.isArray(mockConfig.webServer) ? mockConfig.webServer : []).filter((server) =>
  server.command.endsWith('start-server.js'),
);
if (servers.length !== 1 || !process.env.CJ_ROUTER_TEST_DIR) {
  throw new Error(
    'Routing E2E requires the isolated single-server harness and CJ_ROUTER_TEST_DIR.',
  );
}
export default defineConfig({
  ...mockConfig,
  testDir: 'cj-routing',
  retries: 0,
  workers: 1,
  reporter: [['line']],
  webServer: [
    {
      command: 'python3 e2e/cj-routing/start-router.py',
      cwd: path.resolve(__dirname, '..'),
      url: 'http://127.0.0.1:4119/health',
      reuseExistingServer: false,
    },
    {
      ...servers[0],
      env: {
        ...servers[0].env,
        CONFIG_PATH: path.resolve(__dirname, 'cj-routing/librechat.yaml'),
        ENDPOINTS: 'openAI',
        OPENAI_MODELS: 'gpt-4o-mini,gpt-4o,gpt-4.1',
        OPENAI_API_KEY: 'fixture-not-a-real-api-key',
        ASSISTANTS_API_KEY: '',
        E2E_USE_MEMORY_MONGO: 'true',
        CJ_ROUTER_CONTROL_API_KEY: 'fixture-control-key',
        CJ_ROUTER_SIGNING_KEY: 's'.repeat(32),
      },
    },
  ],
});
