import { OBJECTS_BY_ID } from "../game/catalog";
import { NPCS_BY_ID } from "../game/npcs";
import type {
  ActionResult,
  LiveOption,
  ObjectTransition,
  WorldState,
} from "../shared/types";

const factsAllow = (
  transition: ObjectTransition,
  knownFacts: Set<string>,
): boolean =>
  (transition.requiredFacts ?? []).every((fact) => knownFacts.has(fact)) &&
  (transition.forbiddenFacts ?? []).every((fact) => !knownFacts.has(fact));

export const resolveAction = (
  option: LiveOption,
  world: WorldState,
): ActionResult => {
  const timestamp = Date.now();
  const targetObject = option.targetObjectId
    ? OBJECTS_BY_ID[option.targetObjectId]
    : undefined;
  const targetNpc = option.targetNpcId
    ? NPCS_BY_ID[option.targetNpcId]
    : undefined;
  const currentObjectState = targetObject
    ? world.objectStates[targetObject.id]?.visualState ??
      targetObject.currentVisualState
    : undefined;
  const knownFacts = new Set(world.knownFacts);

  const allowedObjectActions =
    targetObject && currentObjectState
      ? (targetObject.stateActionOverrides?.[currentObjectState] ??
        targetObject.supportedActions)
      : targetObject?.supportedActions;
  if (
    targetObject &&
    !allowedObjectActions?.includes(option.actionType)
  ) {
    return failureResult(
      option,
      currentObjectState,
      "这个物品不支持当前行动",
      timestamp,
    );
  }
  if (targetNpc && !targetNpc.supportedActions.includes(option.actionType)) {
    return failureResult(
      option,
      undefined,
      "对方拒绝了不合适的互动",
      timestamp,
    );
  }
  if (!targetObject && !targetNpc) {
    return failureResult(option, undefined, "交互目标已不在场景中", timestamp);
  }

  const transition = targetObject?.transitions.find(
    (item) =>
      item.actionType === option.actionType &&
      (!item.fromStates ||
        !currentObjectState ||
        item.fromStates.includes(currentObjectState)) &&
      factsAllow(item, knownFacts),
  );

  const summary =
    transition?.resultSummary ??
    `${option.actorId}执行了“${option.shortLabel}”`;
  const changedFacts = transition?.setsFacts ?? {};
  const relationshipDelta = transition?.relationshipDelta ?? {};

  return {
    success: true,
    actorId: option.actorId,
    targetObjectId: targetObject?.id,
    targetNpcId: targetNpc?.id,
    actionType: option.actionType,
    previousObjectState: currentObjectState,
    nextObjectState: transition?.toState ?? currentObjectState,
    changedFacts,
    revealedFacts: transition?.revealsFacts ?? [],
    inventoryAdds: transition?.inventoryAdds ?? [],
    relationshipDelta,
    objectStateChanges: transition?.objectStateChanges ?? {},
    tensionDelta: transition?.tensionDelta ?? actionTension(option.actionType),
    newEvent: {
      id: crypto.randomUUID(),
      timestamp,
      summary,
      objectId: targetObject?.id,
      npcId: targetNpc?.id,
    },
    animationCue:
      transition?.animationCue || option.animationCue || "actor_interact",
    dialogueShouldContinue:
      transition?.dialogueShouldContinue ??
      ["QUESTION", "NEGOTIATE", "ACCUSE", "SHOW_EVIDENCE"].includes(
        option.actionType,
      ),
    summary,
  };
};

const actionTension = (actionType: LiveOption["actionType"]): number => {
  if (actionType === "ACCUSE") return 8;
  if (actionType === "SHOW_EVIDENCE") return 6;
  if (actionType === "NEGOTIATE") return -2;
  return 0;
};

const failureResult = (
  option: LiveOption,
  previousObjectState: string | undefined,
  summary: string,
  timestamp: number,
): ActionResult => ({
  success: false,
  actorId: option.actorId,
  targetObjectId: option.targetObjectId,
  targetNpcId: option.targetNpcId,
  actionType: option.actionType,
  previousObjectState,
  nextObjectState: previousObjectState,
  changedFacts: {},
  revealedFacts: [],
  inventoryAdds: [],
  relationshipDelta: {},
  objectStateChanges: {},
  tensionDelta: 0,
  newEvent: {
    id: crypto.randomUUID(),
    timestamp,
    summary,
    objectId: option.targetObjectId,
    npcId: option.targetNpcId,
  },
  animationCue: "actor_blocked",
  dialogueShouldContinue: false,
  summary,
});
