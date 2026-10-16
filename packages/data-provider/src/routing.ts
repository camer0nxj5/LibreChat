import { z } from 'zod';

export const routeChoiceSchema = z.enum(['local', 'fireworks', 'chatgpt']);
export const routeCardSchema = z.object({
  version: z.literal(1),
  id: z.string().min(1).max(100),
  expiresAt: z.number().int().positive(),
  message: z.string().min(1).max(2000),
  categories: z
    .array(z.enum(['google_sheets', 'coding']))
    .min(1)
    .max(2),
  actions: z
    .array(z.object({ id: routeChoiceSchema, label: z.string().min(1).max(100) }))
    .length(3),
  token: z.string().min(1).max(16000),
});
export const routeDecisionSchema = z.object({
  token: z.string().min(1).max(16000),
  action: routeChoiceSchema,
});
export const routeInputSchema = z.object({
  text: z.string().max(500000),
  conversationId: z.string().nullable().optional(),
  endpoint: z.string().min(1).max(200),
  model: z.string().min(1).max(200),
  requestId: z.string().min(1).max(128),
  googleTools: z.boolean().optional(),
  currentSources: z.boolean().optional(),
});
export const cjRouterConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    engine: z.enum(['cj-router-v2', 'clawiq']).default('cj-router-v2'),
    url: z.string().url(),
    controlKeyEnv: z.string().default('CJ_ROUTER_CONTROL_API_KEY'),
    signingKeyEnv: z.string().default('CJ_ROUTER_SIGNING_KEY'),
    localEndpoints: z.array(z.string().min(1)).min(1),
    timeoutMs: z.number().int().min(100).max(30000).default(5000),
  })
  .optional();

export type RouteChoice = z.infer<typeof routeChoiceSchema>;
export type RouteCard = z.infer<typeof routeCardSchema>;
export type RouteDecision = z.infer<typeof routeDecisionSchema>;
export type RouteInput = z.infer<typeof routeInputSchema>;
export type RouteAssessment = { card: RouteCard | null };
