import type { GridPosition } from "./isometric";
import objectStateDocument from "../../content/world/object-states.json";

export type ObjectAnchorType =
  | "WORLD"
  | "CHARACTER"
  | "PROP"
  | "REMOVED";

export type ObjectSocket =
  | "LEFT_HAND"
  | "RIGHT_HAND"
  | "BOTH_HANDS"
  | "SURFACE";

export type ObjectAnchor = {
  type: ObjectAnchorType;
  targetId?: string;
  socket?: ObjectSocket;
  gridPosition?: GridPosition;
};

export type ObjectRuntime = {
  visualState: string;
  anchor: ObjectAnchor;
  facts: Record<string, boolean | number | string>;
  reservedBy?: string;
};

export type ObjectVisualSpec = {
  id: string;
  states: readonly [string] | readonly [string, string] | readonly [string, string, string];
  initialState: string;
};

/**
 * 视觉状态只描述“要换哪张图”，位置、占用者、成熟度、是否校准等
 * 都放在 anchor / facts 中，避免状态组合爆炸。
 */
export const OBJECT_VISUAL_SPECS: readonly ObjectVisualSpec[] =
  objectStateDocument.objects.map((item) => {
    if (item.states.length < 1 || item.states.length > 3) {
      throw new Error(`${item.id} 的视觉状态必须为 1 至 3 个`);
    }
    if (!item.states.includes(item.initialState)) {
      throw new Error(`${item.id} 的初始状态未包含在 states 中`);
    }
    return {
      id: item.id,
      states: item.states as ObjectVisualSpec["states"],
      initialState: item.initialState,
    };
  });

export const OBJECT_VISUAL_SPECS_BY_ID = Object.fromEntries(
  OBJECT_VISUAL_SPECS.map((item) => [item.id, item]),
) as Record<string, ObjectVisualSpec>;

export const visualStatesFor = (objectId: string): readonly string[] =>
  OBJECT_VISUAL_SPECS_BY_ID[objectId]?.states ?? ["NORMAL"];

export const initialVisualStateFor = (objectId: string): string =>
  OBJECT_VISUAL_SPECS_BY_ID[objectId]?.initialState ?? "NORMAL";

export const isAllowedVisualState = (
  objectId: string,
  state: string,
): boolean => visualStatesFor(objectId).includes(state);

export const createObjectRuntime = (
  objectId: string,
  gridPosition?: GridPosition,
  facts: ObjectRuntime["facts"] = {},
): ObjectRuntime => ({
  visualState: initialVisualStateFor(objectId),
  anchor: {
    type: "WORLD",
    ...(gridPosition ? { gridPosition } : {}),
  },
  facts: { ...facts },
});

export const LEGACY_PROP_STATE_MAP: Record<string, string> = {
  default: "DEFAULT",
  "one-missing": "DISTURBED",
  hidden: "HELD",
  "on-scale": "WHOLE",
  weighing: "LOADED",
  "magnet-revealed": "EXPOSED",
  "on-cutting-table": "WHOLE",
  "cut-open": "CUT",
};

export const normalizeStoryPropState = (
  objectId: string,
  state: string,
): string => {
  const mapped = LEGACY_PROP_STATE_MAP[state] ?? state.toUpperCase();
  if (mapped === "DEFAULT") return initialVisualStateFor(objectId);
  return isAllowedVisualState(objectId, mapped)
    ? mapped
    : initialVisualStateFor(objectId);
};

export type InstantInteraction =
  | {
      action: "PICK_UP";
      actorId: string;
      objectId: string;
      socket?: Extract<ObjectSocket, "LEFT_HAND" | "RIGHT_HAND" | "BOTH_HANDS">;
    }
  | {
      action: "PLACE";
      actorId: string;
      objectId: string;
      targetId: string;
      gridPosition?: GridPosition;
    }
  | {
      action: "DROP";
      actorId: string;
      objectId: string;
      gridPosition: GridPosition;
    }
  | {
      action: "CUT";
      actorId: string;
      objectId: string;
      targetId: string;
    };

export type InstantInteractionResult =
  | { ok: true; objects: Record<string, ObjectRuntime> }
  | { ok: false; reason: string; objects: Record<string, ObjectRuntime> };

const clonedObjects = (
  objects: Record<string, ObjectRuntime>,
): Record<string, ObjectRuntime> =>
  Object.fromEntries(
    Object.entries(objects).map(([id, value]) => [
      id,
      {
        ...value,
        anchor: { ...value.anchor },
        facts: { ...value.facts },
      },
    ]),
  );

export const applyInstantInteraction = (
  objects: Record<string, ObjectRuntime>,
  interaction: InstantInteraction,
): InstantInteractionResult => {
  const next = clonedObjects(objects);
  const object = next[interaction.objectId];
  if (!object) return { ok: false, reason: "目标物品不存在", objects };
  if (object.reservedBy && object.reservedBy !== interaction.actorId) {
    return { ok: false, reason: "目标物品已被占用", objects };
  }

  if (interaction.action === "PICK_UP") {
    if (object.anchor.type === "CHARACTER") {
      return { ok: false, reason: "目标物品已被持有", objects };
    }
    const handsBusy = Object.values(next).some(
      (candidate) =>
        candidate.anchor.type === "CHARACTER" &&
        candidate.anchor.targetId === interaction.actorId,
    );
    if (handsBusy) return { ok: false, reason: "人物双手已被占用", objects };
    if (object.anchor.type === "PROP" && object.anchor.targetId) {
      const previousTarget = next[object.anchor.targetId];
      if (previousTarget) {
        previousTarget.visualState = initialVisualStateFor(
          object.anchor.targetId,
        );
      }
    }
    object.visualState = isAllowedVisualState(interaction.objectId, "HELD")
      ? "HELD"
      : object.visualState;
    object.anchor = {
      type: "CHARACTER",
      targetId: interaction.actorId,
      socket: interaction.socket ?? "BOTH_HANDS",
    };
    return { ok: true, objects: next };
  }

  if (
    object.anchor.type !== "CHARACTER" ||
    object.anchor.targetId !== interaction.actorId
  ) {
    return { ok: false, reason: "人物没有持有该物品", objects };
  }

  if (interaction.action === "DROP") {
    object.visualState = isAllowedVisualState(interaction.objectId, "WHOLE")
      ? "WHOLE"
      : object.visualState;
    object.anchor = {
      type: "WORLD",
      gridPosition: interaction.gridPosition,
    };
    return { ok: true, objects: next };
  }

  if (interaction.action === "PLACE") {
    const target = next[interaction.targetId];
    if (!target) {
      return { ok: false, reason: "承载物不存在", objects };
    }
    if (target?.visualState === "LOADED" || target?.visualState === "OCCUPIED") {
      return { ok: false, reason: "目标表面已被占用", objects };
    }
    object.visualState = isAllowedVisualState(interaction.objectId, "WHOLE")
      ? "WHOLE"
      : object.visualState;
    object.anchor = {
      type: "PROP",
      targetId: interaction.targetId,
      socket: "SURFACE",
      ...(interaction.gridPosition
        ? { gridPosition: interaction.gridPosition }
        : {}),
    };
    if (target) {
      if (isAllowedVisualState(interaction.targetId, "LOADED")) {
        target.visualState = "LOADED";
      } else if (isAllowedVisualState(interaction.targetId, "OCCUPIED")) {
        target.visualState = "OCCUPIED";
      } else if (isAllowedVisualState(interaction.targetId, "FILLED")) {
        target.visualState = "FILLED";
      }
    }
    return { ok: true, objects: next };
  }

  const target = next[interaction.targetId];
  if (!target) {
    return { ok: false, reason: "切瓜台不存在", objects };
  }
  if (!isAllowedVisualState(interaction.objectId, "CUT")) {
    return { ok: false, reason: "该物品不能切开", objects };
  }
  object.visualState = "CUT";
  object.anchor = {
    type: "PROP",
    targetId: interaction.targetId,
    socket: "SURFACE",
  };
  if (isAllowedVisualState(interaction.targetId, "OCCUPIED")) {
    target.visualState = "OCCUPIED";
  }
  return { ok: true, objects: next };
};
