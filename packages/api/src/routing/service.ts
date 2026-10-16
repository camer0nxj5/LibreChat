import { z } from 'zod';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  cjRouterConfigSchema,
  routeCardSchema,
  routeInputSchema,
  routeDecisionSchema,
  parseCompactConvo,
  EModelEndpoint,
} from 'librechat-data-provider';
import type {
  Agent,
  RouteCard,
  RouteDecision,
  RouteInput,
  TEndpointOption,
  TConversation,
} from 'librechat-data-provider';
import type { NextFunction, Request, Response } from 'express';
import type { AppConfig } from '@librechat/data-schemas';
import type { ResumeContext } from '~/agents/hitl/policy';

const targetSchema = z.object({
  label: z.string().min(1).max(100),
  endpoint: z.string().min(1).max(200),
  model: z.string().min(1).max(200),
  useResponsesApi: z.boolean().optional(),
});
const resolvedSchema = z.object({
  action: z.enum(['local', 'fireworks', 'chatgpt']),
  target: targetSchema.nullable(),
  transport: z.literal('clawiq').optional(),
  permit: z.string().min(32).max(128).optional(),
  routeModel: z.string().min(1).max(200).optional(),
});
type RouteTarget = { label: string; endpoint: string; model: string; useResponsesApi?: boolean };
type ResolvedRoute = {
  action: 'local' | 'fireworks' | 'chatgpt';
  target: RouteTarget | null;
  transport?: 'clawiq';
  permit?: string;
  routeModel?: string;
};
type RoutingRequest = Request & {
  user?: { id?: string; tenantId?: string };
  config?: AppConfig;
  cjResolvedRoute?: ResolvedRoute;
  cjRouteOrigin?: Partial<TConversation>;
};
type Context = RouteInput & { user: string; tenant: string; conversationId: string };
export type RoutingDeps = {
  readSecret: (name: string) => string | undefined;
  fetchImpl: RoutingFetch;
};
export type RoutingFetch = (url: string, init: RequestInit) => Promise<globalThis.Response>;

function config(req: RoutingRequest) {
  return cjRouterConfigSchema.parse(req.config?.config?.cjRouter);
}

function context(req: RoutingRequest, input: RouteInput): Context {
  if (!req.user?.id) {
    throw new Error('Authentication required');
  }
  return {
    ...input,
    conversationId: input.conversationId === 'new' ? '' : (input.conversationId ?? ''),
    text: input.text.trim(),
    user: req.user.id,
    tenant: req.user.tenantId ?? '',
  };
}

function verifyContext(token: string, expected: Context): void {
  const ordered = Object.fromEntries(
    Object.entries(expected).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
  const canonical = JSON.stringify(ordered).replace(
    /[^\x00-\x7f]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  );
  const digest = createHash('sha256').update(canonical).digest('hex');
  const claims = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString());
  if (claims.context !== digest) {
    throw new Error('Routing card does not belong to this request');
  }
}

export function verifyRouteCard(
  card: RouteCard,
  secret: string,
  source: 'cj-router-v2' | 'clawiq' = 'cj-router-v2',
): void {
  const [body, signature, extra] = card.token.split('.');
  if (!body || !signature || extra || secret.length < 32) {
    throw new Error('Invalid trusted card');
  }
  const expected = createHmac('sha256', secret).update(body).digest();
  const supplied = Buffer.from(signature, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error('Untrusted routing card');
  }
  const claims = routeCardSchema
    .omit({ token: true })
    .extend({
      source: z.literal(source),
    })
    .parse(JSON.parse(Buffer.from(body, 'base64url').toString()));
  const visible = routeCardSchema.omit({ token: true }).parse(card);
  const signedVisible = routeCardSchema.omit({ token: true }).parse(claims);
  if (
    JSON.stringify(visible) !== JSON.stringify(signedVisible) ||
    card.expiresAt * 1000 <= Date.now()
  ) {
    throw new Error('Altered or expired routing card');
  }
  if (card.actions.map((action) => action.id).join(',') !== 'local,fireworks,chatgpt') {
    throw new Error('Invalid routing actions');
  }
}

export function applyCJRoute<T extends Partial<Agent>>(agent: T, resolved?: ResolvedRoute): T {
  if (agent && resolved?.transport === 'clawiq') {
    return { ...agent, tools: [], tool_resources: {}, subagents: undefined };
  }
  if (!agent || !resolved?.target || resolved.action === 'local') {
    return agent;
  }
  return {
    ...agent,
    provider: resolved.target.endpoint,
    model: resolved.target.model,
    // Local sampling/thinking parameters must not leak into the cloud model.
    model_parameters: resolved.target.useResponsesApi ? { useResponsesApi: true } : {},
  };
}

export function cjRoutingPublicConfig(appConfig?: AppConfig): {
  enabled: boolean;
  localEndpoints: string[];
} {
  const settings = cjRouterConfigSchema.parse(appConfig?.config?.cjRouter);
  return { enabled: settings?.enabled === true, localEndpoints: settings?.localEndpoints ?? [] };
}

export function captureCJRouteOrigin(req: RoutingRequest, options: TEndpointOption): void {
  if (!req.cjResolvedRoute?.target || req.cjRouteOrigin) {
    return;
  }
  req.cjRouteOrigin = {
    ...parseCompactConvo({
      endpoint: options.endpoint ?? undefined,
      endpointType: options.endpointType,
      defaultParamsEndpoint: EModelEndpoint.openAI,
      conversation: { ...options.model_parameters, spec: options.spec },
    }),
    endpoint: options.endpoint,
    endpointType: options.endpointType,
    agent_id: options.agent_id,
  };
}

export function preserveCJConversationOptions<T extends Partial<TConversation>>(
  options: T,
  req: RoutingRequest,
): T {
  if (req.cjResolvedRoute?.transport === "clawiq" && req.cjResolvedRoute.routeModel) {
    return { ...options, model: req.cjResolvedRoute.routeModel, spec: undefined };
  }
  return req.cjResolvedRoute?.target && req.cjRouteOrigin
    ? { ...options, ...req.cjRouteOrigin }
    : options;
}

export function cjRouteSender(sender: string, req: RoutingRequest): string {
  return req.cjResolvedRoute?.target?.label ?? sender;
}

type RoutingResumeContext = ResumeContext & {
  cjResolvedRoute?: ResolvedRoute;
  cjRouteOrigin?: Partial<TConversation>;
};

export function captureCJRoutingResume(ctx: RoutingResumeContext, req?: RoutingRequest): void {
  if (req?.cjResolvedRoute) {
    ctx.cjResolvedRoute = req.cjResolvedRoute;
    ctx.cjRouteOrigin = req.cjRouteOrigin;
  }
}

/** Only receives the backend's stored pending-action context, never a browser field. */
export function restoreCJRoutingResume(req: RoutingRequest, ctx?: RoutingResumeContext): void {
  delete req.cjResolvedRoute;
  delete req.cjRouteOrigin;
  if (ctx?.cjResolvedRoute) {
    req.cjResolvedRoute = resolvedSchema.parse(ctx.cjResolvedRoute);
    req.cjRouteOrigin = ctx.cjRouteOrigin;
  }
}

type RoutingHandlers = {
  assess: (req: RoutingRequest, res: Response) => Promise<void>;
  gate: (req: RoutingRequest, res: Response, next: NextFunction) => Promise<void>;
};

export function createCJRoutingHandlers(deps: RoutingDeps): RoutingHandlers {
  async function control(
    req: RoutingRequest,
    path: string,
    payload: {
      context: Context;
      token?: string;
      action?: RouteDecision['action'];
    },
  ) {
    const settings = config(req);
    if (!settings?.enabled) {
      throw new Error('Routing disabled');
    }
    const key = deps.readSecret(settings.controlKeyEnv);
    if (!key) {
      throw new Error('Routing credentials unavailable');
    }
    const response = await deps.fetchImpl(`${settings.url.replace(/\/$/, '')}/control/${path}`, {
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(settings.timeoutMs),
    });
    if (!response.ok) {
      throw new Error('Router rejected control request');
    }
    return response.json();
  }

  async function assess(req: RoutingRequest, res: Response) {
    try {
      const settings = config(req);
      if (!settings?.enabled) {
        res.json({ card: null });
        return;
      }
      const input = routeInputSchema.parse(req.body);
      if (!settings.localEndpoints.includes(input.endpoint)) {
        res.json({ card: null });
        return;
      }
      const trustedContext = context(req, input);
      const value = z
        .object({ card: routeCardSchema.nullable() })
        .parse(await control(req, 'assess', { context: trustedContext }));
      if (value.card) {
        verifyRouteCard(value.card, deps.readSecret(settings.signingKeyEnv) ?? '', settings.engine);
        verifyContext(value.card.token, trustedContext);
      }
      res.json(value);
      return;
    } catch {
      res.status(503).json({ error: 'Routing check unavailable. Your request has not been sent.' });
      return;
    }
  }

  async function gate(req: RoutingRequest, res: Response, next: NextFunction) {
    try {
      const settings = config(req);
      if (
        !settings?.enabled ||
        req.path === '/resume' ||
        req.method !== 'POST' ||
        req.body.cjRoutingVersion !== 1 ||
        req.body.compact
      ) {
        return next();
      }
      const { endpoint, model, text, conversationId, clientRequestId, cjRouteDecision } = req.body;
      if (!settings.localEndpoints.includes(endpoint)) {
        return next();
      }
      const input = routeInputSchema.parse({
        endpoint,
        model,
        text,
        conversationId,
        requestId: clientRequestId,
        ...(req.body.ephemeralAgent?.google_tools === true ? { googleTools: true } : {}),
        ...(req.body.ephemeralAgent?.current_sources === true ? { currentSources: true } : {}),
      });
      const trustedContext = context(req, input);
      if (cjRouteDecision) {
        const decision = routeDecisionSchema.parse(cjRouteDecision);
        const claims = JSON.parse(
          Buffer.from(decision.token.split('.')[0], 'base64url').toString(),
        );
        verifyRouteCard(
          routeCardSchema.parse({ ...claims, token: decision.token }),
          deps.readSecret(settings.signingKeyEnv) ?? '',
          settings.engine,
        );
        verifyContext(decision.token, trustedContext);
        const resolved = resolvedSchema.parse(
          await control(req, 'resolve', {
            context: trustedContext,
            ...decision,
          }),
        );
        if (
          resolved.action !== decision.action ||
          (resolved.action !== 'local' && !resolved.target)
        ) {
          throw new Error('Invalid routing selection');
        }
        const signedTarget =
          decision.action === 'local' ? null : targetSchema.parse(claims.targets[decision.action]);
        if (JSON.stringify(resolved.target) !== JSON.stringify(signedTarget)) {
          throw new Error('Altered routing destination');
        }
        if (settings.engine === 'clawiq' && (!resolved.permit || resolved.transport !== 'clawiq')) {
          throw new Error('Missing trusted ClawiQ permit');
        }
        req.cjResolvedRoute = resolved;
        return next();
      }
      const value = z
        .object({ card: routeCardSchema.nullable() })
        .parse(await control(req, 'assess', { context: trustedContext }));
      if (!value.card) {
        if (settings.engine === 'clawiq') {
          const resolved = resolvedSchema.parse(
            await control(req, 'resolve', { context: trustedContext }),
          );
          if (resolved.transport !== 'clawiq' || !resolved.permit) {
            throw new Error('Invalid local permit');
          }
          req.cjResolvedRoute = resolved;
        }
        return next();
      }
      verifyRouteCard(value.card, deps.readSecret(settings.signingKeyEnv) ?? '', settings.engine);
      verifyContext(value.card.token, trustedContext);
      res
        .status(428)
        .json({ error: 'Choose a routing option before sending this request.', card: value.card });
      return;
    } catch {
      res
        .status(503)
        .json({ error: 'Routing verification failed. Your request has not been sent.' });
      return;
    }
  }

  return { assess, gate };
}

/** Insert a backend-only one-shot permit after endpoint headers have been resolved. */
export function attachClawiQPermit<T extends Partial<Agent>>(
  agent: T,
  req: RoutingRequest,
  conversationId?: string,
): T {
  if (
    config(req)?.engine !== 'clawiq' ||
    !config(req)?.localEndpoints.includes(req.body.endpoint ?? '')
  ) {
    return agent;
  }
  if (req.cjResolvedRoute?.transport !== 'clawiq' || !req.cjResolvedRoute.permit) {
    throw new Error('ClawiQ request requires verified selection');
  }
  // OpenClaw owns the tool loop. Suppress LibreChat's loaded tool registry, including
  // automatic tools, before the run binds any definitions to the model.
  Object.assign(agent, {
    toolDefinitions: [],
    toolRegistry: new Map(),
    tools: [],
    subagents: undefined,
    lazySubagentConfigs: undefined,
    subagentGraphConfigs: undefined,
  });
  const parameters = agent.model_parameters as Record<string, unknown> | undefined;
  const configuration = (parameters?.configuration ?? {}) as Record<string, unknown>;
  agent.model_parameters = {
    ...parameters,
    maxRetries: 0,
    configuration: {
      ...configuration,
      maxRetries: 0,
      defaultHeaders: {
        ...(configuration.defaultHeaders as Record<string, string> | undefined),
        'X-ClawiQ-Permit': req.cjResolvedRoute.permit,
        ...(conversationId ? { 'X-ClawiQ-Conversation': conversationId } : {}),
      },
    },
  } as unknown as Agent['model_parameters'];
  return agent;
}
