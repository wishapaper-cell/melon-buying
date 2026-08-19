import { getSceneObjects, OBJECTS_BY_ID } from "./catalog";
import { MELON_STREET_NPCS, NPCS_BY_ID } from "./npcs";
import type {
  InteractionContext,
  InteractionTargetKind,
  WorldState,
} from "../shared/types";

export const buildInteractionContext = (
  world: WorldState,
  objectId: string,
  targetKind: InteractionTargetKind,
): InteractionContext => {
  const object = OBJECTS_BY_ID[objectId];
  const npc = NPCS_BY_ID[objectId];
  const target = targetKind === "OBJECT" ? object : npc;
  if (!target) {
    throw new Error(`交互目标不存在：${objectId}`);
  }

  const sceneObjects = getSceneObjects(world.currentSceneId).filter(
    (item) => world.objectStates[item.id]?.discovered !== false,
  );
  const nearbyNpcs = MELON_STREET_NPCS.filter(
    (item) => item.sceneId === world.currentSceneId,
  );
  const targetState =
    targetKind === "OBJECT"
      ? (world.objectStates[objectId]?.visualState ?? "NORMAL")
      : world.npcEmotions[objectId] ?? npc!.emotion;
  const supportedActions =
    targetKind === "OBJECT"
      ? (object!.stateActionOverrides?.[targetState] ??
        object!.supportedActions)
      : npc!.supportedActions;

  const allPotentialFacts = [
    "scale_contains_magnet",
    "melon_weight_is_suspicious",
    "scale_calibration_is_wrong",
    "cut_melon_is_unripe",
    "melon_is_ripe",
    "price_sign_was_altered",
    "crate_has_supplier_tag",
    "trash_has_weight_ticket",
    "wall_ad_covers_old_mark",
    "melon_pile_has_old_receipt",
    "motorcycle_key_found",
  ];
  const known = new Set(world.knownFacts);

  return {
    actorId: "HUAQIANG",
    sceneId: world.currentSceneId,
    objectId,
    targetDisplayName: target.displayName,
    targetKind,
    objectState: targetState,
    objectFacts:
      targetKind === "OBJECT"
        ? (world.objectStates[objectId]?.facts ?? {})
        : {},
    supportedActions,
    nearbyNpcIds: nearbyNpcs.map((item) => item.id),
    npcEmotions: Object.fromEntries(
      nearbyNpcs.map((item) => [
        item.id,
        world.npcEmotions[item.id] ?? item.emotion,
      ]),
    ),
    npcGoals: Object.fromEntries(
      nearbyNpcs.map((item) => [item.id, item.goal]),
    ),
    knownFacts: [...world.knownFacts],
    unknownFacts: allPotentialFacts.filter((fact) => !known.has(fact)),
    unknownFactLabels: {
      scale_contains_magnet: "秤里有吸铁石",
      melon_weight_is_suspicious: "瓜的重量有问题",
      scale_calibration_is_wrong: "台秤校准错误",
      cut_melon_is_unripe: "切开的瓜没熟",
      melon_is_ripe: "西瓜已经熟透",
      price_sign_was_altered: "价格牌被改过",
      crate_has_supplier_tag: "木箱里有供货标签",
      trash_has_weight_ticket: "垃圾桶里有称重票",
      wall_ad_covers_old_mark: "广告后有旧记号",
      melon_pile_has_old_receipt: "瓜堆下有旧收据",
      motorcycle_key_found: "摩托车钥匙已找到",
    },
    relationships: { ...world.relationships },
    recentEvents: world.recentEvents.slice(-8),
    inventory: [...world.inventory],
    tension: world.tension,
    streetOpinion: world.streetOpinion,
    currentTime: world.currentTime,
    availableExitIds: sceneObjects
      .filter((item) => item.category === "PORTAL")
      .map((item) => item.id),
    availableObjectIds: sceneObjects.map((item) => item.id),
    canonBeatId: world.canonBeatId,
    canonRouteActive: world.canonRouteActive,
    voteHistory: world.voteHistory.slice(-8),
    worldlineId: world.worldlineId,
  };
};
