import express from 'express';
import request from 'supertest';
import { createHash, createHmac } from 'node:crypto';
import { EModelEndpoint } from 'librechat-data-provider';
import type { RouteCard } from 'librechat-data-provider';
import type { RoutingFetch } from './service';
import {
  applyCJRoute,
  attachClawiQPermit,
  createCJRoutingHandlers,
  verifyRouteCard,
  captureCJRoutingResume,
  restoreCJRoutingResume,
  preserveCJConversationOptions,
  cjRouteSender,
} from './service';

const signingKey = 's'.repeat(32);
const input = {
  text: 'Fix my Python code',
  endpoint: 'Local',
  model: 'qwen',
  conversationId: 'c1',
  requestId: 'r1',
};
const target = { label: 'Cloud', endpoint: 'Fireworks', model: 'kimi' };
const config = { enabled: true, url: 'http://localhost:4110', localEndpoints: ['Local'] };

function cardFor(overrides = {}): RouteCard {
  const ctx = { ...input, user: 'u1', tenant: 't1', ...overrides };
  const canonical = JSON.stringify(
    Object.fromEntries(Object.entries(ctx).sort(([a], [b]) => (a < b ? -1 : 1))),
  );
  const claims = {
    version: 1,
    source: 'cj-router-v2',
    id: 'card1',
    expiresAt: Math.floor(Date.now() / 1000) + 600,
    context: createHash('sha256').update(canonical).digest('hex'),
    message: 'Switch for coding?',
    categories: ['coding'],
    actions: [
      { id: 'local', label: 'Continue with Local' },
      { id: 'fireworks', label: 'Cloud' },
      { id: 'chatgpt', label: 'GPT' },
    ],
    targets: { fireworks: target, chatgpt: { ...target, endpoint: 'openAI', model: 'gpt' } },
  };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const token = `${body}.${createHmac('sha256', signingKey).update(body).digest('base64url')}`;
  return {
    ...claims,
    categories: ['coding'],
    actions: [
      { id: 'local', label: 'Continue with Local' },
      { id: 'fireworks', label: 'Cloud' },
      { id: 'chatgpt', label: 'GPT' },
    ],
    version: 1,
    token,
  };
}

function appFor(fetchImpl: RoutingFetch, enabled = true) {
  const handlers = createCJRoutingHandlers({
    fetchImpl,
    readSecret: (name) => (name === 'CJ_ROUTER_SIGNING_KEY' ? signingKey : 'control-key'),
  });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    Object.assign(req, {
      user: { id: 'u1', tenantId: 't1' },
      config: { config: { cjRouter: { ...config, enabled } } },
    });
    next();
  });
  app.post('/assess', handlers.assess);
  app.post('/send', handlers.gate, (_req, res) => {
    res.json({ generated: true });
  });
  return app;
}

const sendInput = { ...input, clientRequestId: input.requestId, cjRoutingVersion: 1 };

describe('trusted routing boundary', () => {
  it('keeps older clients local without requiring an unsupported card', async () => {
    const fetchImpl = jest.fn(() => {
      throw new Error('Must not fetch');
    });
    const app = appFor(fetchImpl);
    const legacy = { ...sendInput, cjRoutingVersion: undefined };
    expect((await request(app).post('/send').send(legacy)).body).toEqual({ generated: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('preserves disabled defaults without contacting the router', async () => {
    const fetchImpl = jest.fn(() => {
      throw new Error('Must not fetch');
    });
    const app = appFor(fetchImpl, false);
    expect((await request(app).post('/assess').send(input)).body).toEqual({ card: null });
    expect((await request(app).post('/send').send(sendInput)).body).toEqual({ generated: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('returns authenticated signed cards and blocks generation until a choice', async () => {
    const card = cardFor();
    const fetchImpl: RoutingFetch = async () => new Response(JSON.stringify({ card }));
    const app = appFor(fetchImpl);
    expect((await request(app).post('/assess').send(input)).body.card).toMatchObject({
      token: card.token,
      message: card.message,
    });
    const held = await request(app).post('/send').send(sendInput);
    expect(held.status).toBe(428);
    expect(held.body.generated).toBeUndefined();
  });

  it.each(['local', 'fireworks', 'chatgpt'])('admits the verified %s choice', async (action) => {
    const selected =
      action === 'local'
        ? null
        : action === 'fireworks'
          ? target
          : { ...target, endpoint: 'openAI', model: 'gpt' };
    const fetchImpl: RoutingFetch = async () =>
      new Response(JSON.stringify({ action, target: selected }));
    const sent = await request(appFor(fetchImpl))
      .post('/send')
      .send({ ...sendInput, cjRouteDecision: { action, token: cardFor().token } });
    expect(sent.status).toBe(200);
    expect(sent.body.generated).toBe(true);
  });

  it('rejects a forged signature and altered visible text', () => {
    const card = cardFor();
    expect(() => verifyRouteCard({ ...card, token: card.token + 'x' }, signingKey)).toThrow();
    expect(() => verifyRouteCard({ ...card, message: 'Forged prompt' }, signingKey)).toThrow();
    expect(() => verifyRouteCard({ ...card, expiresAt: 1 }, signingKey)).toThrow();
  });

  it.each(['user', 'tenant', 'conversationId', 'text', 'model', 'requestId'])(
    'rejects cross-request %s replay before resolve',
    async (field) => {
      const fetchImpl = jest.fn(async () => new Response('{}'));
      const response = await request(appFor(fetchImpl))
        .post('/send')
        .send({
          ...sendInput,
          cjRouteDecision: { action: 'fireworks', token: cardFor({ [field]: 'other' }).token },
        });
      expect(response.status).toBe(503);
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('rejects a destination substituted in the control response', async () => {
    const fetchImpl: RoutingFetch = async () =>
      new Response(
        JSON.stringify({ action: 'fireworks', target: { ...target, endpoint: 'evil' } }),
      );
    const response = await request(appFor(fetchImpl))
      .post('/send')
      .send({ ...sendInput, cjRouteDecision: { action: 'fireworks', token: cardFor().token } });
    expect(response.status).toBe(503);
    expect(response.body.generated).toBeUndefined();
  });

  it('fails closed when the router is unavailable', async () => {
    const fetchImpl: RoutingFetch = async () => {
      throw new Error('offline');
    };
    expect((await request(appFor(fetchImpl)).post('/send').send(sendInput)).status).toBe(503);
  });

  it('changes only the runtime agent and clears incompatible local parameters', () => {
    const agent = {
      id: 'local-agent',
      provider: 'Local',
      model: 'qwen',
      tools: ['google_sheets'],
      model_parameters: {
        model: 'qwen',
        temperature: 0.3,
        maxContextTokens: null,
        max_context_tokens: null,
        max_output_tokens: null,
        top_p: null,
        frequency_penalty: null,
        presence_penalty: null,
      },
    };
    const routed = applyCJRoute(agent, { action: 'fireworks', target });
    expect(routed.provider).toBe('Fireworks');
    expect(routed.model).toBe('kimi');
    expect(routed.tools).toEqual(agent.tools);
    expect(routed.model_parameters).toEqual({});
    expect(agent.provider).toBe('Local');
    expect(applyCJRoute(agent, { action: 'local', target: null })).toBe(agent);
  });

  it('pins the selected runtime across approval pauses without changing conversation defaults', () => {
    const req = Object.assign(Object.create(express.request), {
      cjResolvedRoute: { action: 'fireworks' as const, target },
      cjRouteOrigin: { model: 'qwen', endpoint: EModelEndpoint.custom },
    });
    const ctx = {};
    captureCJRoutingResume(ctx, req);
    const restored = Object.create(express.request);
    restored.body = {
      cjResolvedRoute: { action: 'chatgpt', target: { ...target, model: 'evil' } },
    };
    restoreCJRoutingResume(restored, ctx);
    expect(restored.cjResolvedRoute.target.model).toBe('kimi');
    expect(preserveCJConversationOptions({ model: 'kimi' }, restored).model).toBe('qwen');
    expect(cjRouteSender('Local', restored)).toBe('Cloud');
    restoreCJRoutingResume(restored);
    expect(restored.cjResolvedRoute).toBeUndefined();
  });
});

it('keeps ClawiQ as the transport and binds only a verified backend permit with no LibreChat tools', () => {
  const resolved = {
    action: 'fireworks' as const,
    target,
    transport: 'clawiq' as const,
    permit: 'p'.repeat(43),
  };
  const agent = { provider: 'ClawiQ', model: 'clawiq/auto', tools: ['web_search'] };
  expect(applyCJRoute(agent, resolved)).toMatchObject({
    provider: 'ClawiQ',
    model: 'clawiq/auto',
    tools: [],
  });
  const runtime = {
    ...agent,
    provider: 'openAI',
    toolDefinitions: ['web_search'],
    toolRegistry: new Map([['web_search', {}]]),
  };
  const req = {
    body: { endpoint: 'ClawiQ' },
    config: { config: { cjRouter: { ...config, engine: 'clawiq', localEndpoints: ['ClawiQ'] } } },
    cjResolvedRoute: resolved,
  } as unknown as Parameters<typeof attachClawiQPermit>[1];
  attachClawiQPermit(runtime, req, 'actual-conversation');
  expect(runtime.toolDefinitions).toEqual([]);
  expect(runtime.toolRegistry.size).toBe(0);
  expect(runtime).toMatchObject({
    model_parameters: {
      maxRetries: 0,
      configuration: {
        defaultHeaders: {
          'X-ClawiQ-Permit': resolved.permit,
          'X-ClawiQ-Conversation': 'actual-conversation',
        },
      },
    },
  });
  req.cjResolvedRoute = undefined;
  expect(() => attachClawiQPermit(runtime, req)).toThrow('verified selection');
});
