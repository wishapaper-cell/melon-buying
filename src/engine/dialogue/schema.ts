import { z } from "zod";
import { EMOTIONS } from "../../shared/constants";

const EmotionSchema = z.enum(
  EMOTIONS as [typeof EMOTIONS[number], ...typeof EMOTIONS],
);

export const GeneratedDialogueTurnSchema = z.object({
  speakerId: z.string().min(1),
  text: z.string().min(1).max(80),
  emotion: EmotionSchema,
  animationCue: z.string().min(1),
  facePortraitState: z.string().min(1),
  cameraCue: z.string().optional(),
  addressedTo: z.string().optional(),
  revealedFacts: z.array(z.string()).optional(),
  concealedFacts: z.array(z.string()).optional(),
  conversationShouldContinue: z.boolean(),
});

export const DialogueTurnsSchema = z
  .array(GeneratedDialogueTurnSchema)
  .min(1)
  .max(4);

export const AiDialogueEnvelopeSchema = z.object({
  turns: DialogueTurnsSchema,
});
