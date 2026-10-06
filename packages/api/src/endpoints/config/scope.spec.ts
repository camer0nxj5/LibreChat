import { createGenerationModelLoader, createModelProviderLoader } from './scope';

describe('generation model catalogs', () => {
  it('does not invoke an unrelated provider integration', async () => {
    const fetch = jest.fn().mockResolvedValue(['remote']);
    expect(await createModelProviderLoader(['Ubuntu NInfer'])('openAI', fetch)).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('loads a selected provider and preserves unscoped picker discovery', async () => {
    const fetch = jest.fn().mockResolvedValue(['remote']);
    expect(await createModelProviderLoader(['openAI'])('openAI', fetch)).toEqual(['remote']);
    expect(await createModelProviderLoader()('openAI', fetch)).toEqual(['remote']);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('coalesces a provider within a request but isolates different requests', async () => {
    const fetch = jest.fn().mockResolvedValue({ ollama: ['model'] });
    const load = createGenerationModelLoader(fetch);
    await Promise.all([load('Ollama'), load('ollama')]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await createGenerationModelLoader(fetch)('Ollama');
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('loads a different provider on demand for a handoff', async () => {
    const fetch = jest.fn().mockResolvedValue({});
    const load = createGenerationModelLoader(fetch);
    await load('Ubuntu NInfer');
    await load('OpenClaw');
    expect(fetch.mock.calls).toEqual([[['Ubuntu NInfer']], [['OpenClaw']]]);
  });
});
