import type {
  DialogueGenerationContext,
  GeneratedDialogueTurn,
} from "../../shared/types";
import { DialogueTurnsSchema } from "./schema";
import type { ValidationResult } from "../options/validator";

export const validateDialogue = (
  rawTurns: unknown,
  context: DialogueGenerationContext,
): ValidationResult => {
  const parsed = DialogueTurnsSchema.safeParse(rawTurns);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  }
  const errors: string[] = [];
  (parsed.data as GeneratedDialogueTurn[]).forEach((turn, index) => {
    if (Array.from(turn.text).length > 40) {
      errors.push(`第${index + 1}句超过40个字符`);
    }
    if (!context.speakerIds.includes(turn.speakerId)) {
      errors.push(`说话角色${turn.speakerId}不在当前场景`);
    }
    for (const fact of turn.revealedFacts ?? []) {
      if (!context.allowedFacts.includes(fact)) {
        errors.push(`对话泄露了不允许公开的事实${fact}`);
      }
    }
    for (const fact of context.forbiddenFacts) {
      const label = context.forbiddenFactLabels[fact];
      if (label && turn.text.includes(label)) {
        errors.push(`对话文本泄露未知事实${fact}`);
      }
    }
  });
  return { valid: errors.length === 0, errors };
};
