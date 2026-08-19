import { z } from "zod";
import { ACTION_TYPES } from "../../shared/constants";

const ActionTypeSchema = z.enum(
  ACTION_TYPES as [typeof ACTION_TYPES[number], ...typeof ACTION_TYPES],
);

export const RuntimeOptionSchema = z.object({
  id: z.enum(["A", "B", "C", "D"]),
  shortLabel: z.string().min(1).max(14),
  description: z.string().min(1).max(40),
  actionType: ActionTypeSchema,
  actorId: z.string().min(1),
  targetObjectId: z.string().min(1).optional(),
  targetNpcId: z.string().min(1).optional(),
  targetSceneId: z.string().min(1).optional(),
  intent: z.string().min(1).max(80),
  expectedTone: z.string().min(1).max(24),
  canonical: z.boolean(),
  requiredObjects: z.array(z.string()),
  requiredFacts: z.array(z.string()),
  forbiddenFacts: z.array(z.string()),
  animationCue: z.string().min(1),
  objectStatePreview: z.string().optional(),
  riskLevel: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
});

export const RuntimeOptionsArraySchema = z
  .array(RuntimeOptionSchema)
  .length(4);

export const AiOptionsEnvelopeSchema = z.object({
  options: RuntimeOptionsArraySchema,
});
