import {
  ACTION_ANIMATIONS,
  ACTION_LABELS,
} from "../../shared/constants";
import type {
  GeneratedOptionId,
  InteractionContext,
  RuntimeInteractionOptions,
  RuntimeOption,
} from "../../shared/types";
import { buildCanonOption } from "../canon";
import { contextHash } from "../contextHash";

const IDS: GeneratedOptionId[] = ["A", "B", "C", "D"];

const buildOption = (
  id: GeneratedOptionId,
  actionType: InteractionContext["supportedActions"][number],
  context: InteractionContext,
  variantIndex: number,
): RuntimeOption => {
  const variants = ACTION_LABELS[actionType];
  const label = variants[variantIndex % variants.length]!;
  const targetFields =
    context.targetKind === "OBJECT"
      ? { targetObjectId: context.objectId }
      : { targetNpcId: context.objectId };
  return {
    id,
    shortLabel: label,
    description: `围绕${context.targetDisplayName}采取可执行行动。`,
    actionType,
    actorId: context.actorId,
    ...targetFields,
    intent: `${actionType}:${context.objectId}`,
    expectedTone:
      actionType === "ACCUSE"
        ? "ANGRY"
        : actionType === "NEGOTIATE"
          ? "CALM"
          : "CONFIDENT",
    canonical: false,
    requiredObjects:
      context.targetKind === "OBJECT" ? [context.objectId] : [],
    requiredFacts: [],
    forbiddenFacts: [],
    animationCue: ACTION_ANIMATIONS[actionType],
    riskLevel: actionType === "ACCUSE" ? 4 : actionType === "MOVE" ? 3 : 1,
  };
};

export const buildFallbackOptions = (
  context: InteractionContext,
): RuntimeInteractionOptions => {
  const supported =
    context.supportedActions.length > 0
      ? context.supportedActions
      : (["OBSERVE", "WAIT"] as const);
  const canon = buildCanonOption(context);
  const options: RuntimeOption[] = [];

  if (canon) options.push(canon);

  let cursor = 0;
  while (options.length < 4) {
    const action = supported[cursor % supported.length]!;
    if (canon && action === canon.actionType && cursor < supported.length) {
      cursor += 1;
      continue;
    }
    const id = IDS[options.length]!;
    options.push(buildOption(id, action, context, cursor));
    cursor += 1;
  }

  return {
    interactionId: crypto.randomUUID(),
    sceneId: context.sceneId,
    objectId: context.objectId,
    actorId: context.actorId,
    options: options as [
      RuntimeOption,
      RuntimeOption,
      RuntimeOption,
      RuntimeOption,
    ],
    generationContextHash: contextHash({
      worldlineId: context.worldlineId,
      sceneId: context.sceneId,
      objectId: context.objectId,
      objectState: context.objectState,
      actorId: context.actorId,
      nearbyNpcIds: context.nearbyNpcIds,
      recentEvents: context.recentEvents,
      canonBeatId: context.canonBeatId,
    }),
    degraded: true,
    notice: "AI实时生成暂不可用，当前使用本地保底选项",
  };
};
