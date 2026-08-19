import { RuntimeOptionsArraySchema } from "./schema";
import type {
  InteractionContext,
  RuntimeOption,
} from "../../shared/types";

export type ValidationResult = {
  valid: boolean;
  errors: string[];
};

const textLength = (value: string): number => Array.from(value).length;

export const validateRuntimeOptions = (
  rawOptions: unknown,
  context: InteractionContext,
): ValidationResult => {
  const parsed = RuntimeOptionsArraySchema.safeParse(rawOptions);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join(".")}: ${issue.message}`,
      ),
    };
  }

  const options = parsed.data as RuntimeOption[];
  const errors: string[] = [];
  const expectedIds = ["A", "B", "C", "D"];
  const labels = new Set<string>();
  const actionTypes = new Set<string>();

  options.forEach((option, index) => {
    if (option.id !== expectedIds[index]) {
      errors.push(`选项顺序错误：位置${index + 1}应为${expectedIds[index]}`);
    }
    if (textLength(option.shortLabel) > 14) {
      errors.push(`${option.id}标题超过14个字符`);
    }
    if (textLength(option.description) > 40) {
      errors.push(`${option.id}说明超过40个字符`);
    }
    const normalized = option.shortLabel.replace(/\s+/g, "");
    if (labels.has(normalized)) {
      errors.push(`${option.id}与其他选项重复`);
    }
    labels.add(normalized);
    actionTypes.add(option.actionType);

    if (!context.supportedActions.includes(option.actionType)) {
      errors.push(`${option.id}行动${option.actionType}不可执行`);
    }
    if (
      context.targetKind === "OBJECT" &&
      option.targetObjectId !== context.objectId
    ) {
      errors.push(`${option.id}没有直接指向当前物品`);
    }
    if (
      context.targetKind === "NPC" &&
      option.targetNpcId !== context.objectId
    ) {
      errors.push(`${option.id}没有直接指向当前NPC`);
    }
    for (const objectId of option.requiredObjects) {
      if (!context.availableObjectIds.includes(objectId)) {
        errors.push(`${option.id}引用了不存在的物品${objectId}`);
      }
    }
    for (const fact of option.requiredFacts) {
      if (!context.knownFacts.includes(fact)) {
        errors.push(`${option.id}依赖角色未知事实${fact}`);
      }
    }
    for (const fact of option.forbiddenFacts) {
      if (context.knownFacts.includes(fact)) {
        errors.push(`${option.id}与已发生事实${fact}冲突`);
      }
    }
    const visibleText = `${option.shortLabel}${option.description}`;
    for (const fact of context.unknownFacts) {
      const secretLabel = context.unknownFactLabels[fact];
      if (secretLabel && visibleText.includes(secretLabel)) {
        errors.push(`${option.id}泄露了未知事实${fact}`);
      }
    }
    if (option.canonical) {
      if (
        option.id !== "A" ||
        !context.canonRouteActive ||
        !context.canonBeatId
      ) {
        errors.push(`${option.id}非法标记为经典选项`);
      }
    }
  });

  if (actionTypes.size < 2) {
    errors.push("四个选项至少需要两种不同的行动类型");
  }
  return { valid: errors.length === 0, errors };
};
