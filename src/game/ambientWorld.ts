import { useEffect, useRef, useState } from "react";
import {
  findGridPath,
  type GridPosition,
  type PlayerRuntimeState,
} from "./isometric";
import {
  hallucinationFrameFor,
  hallucinationKindFor,
  hallucinationSprite,
} from "./hallucinationCast";
import type { DayPhase, SanStage } from "./realtimeWorld";

export type AmbientKind =
  | "PASSERBY_MAN"
  | "PASSERBY_WOMAN"
  | "COOLING_OLDMAN"
  | "DOG_WALKER"
  | "DOG";

export type AmbientModel =
  | "PASSERBY_MAN"
  | "PASSERBY_WOMAN"
  | "COOLING_OLDMAN"
  | "DELIVERY_WORKER"
  | "CYCLIST"
  | "BASKET_GRANDMA"
  | "STREET_DOG";

export type AmbientEntity = {
  id: string;
  scenarioId: string;
  kind: AmbientKind;
  model: AmbientModel;
  position: GridPosition;
  direction: "left" | "right";
  frame: number;
  moving: boolean;
  path: GridPosition[];
  goal: GridPosition;
  stepIndex: number;
  blockedSince?: number;
  phase: "ENTERING" | "CHATTING" | "LEAVING" | "RESTING";
  phaseUntil?: number;
  exit: GridPosition;
  partnerId?: string;
  emoji: string;
  bornAt: number;
  expiresAt: number;
  ownerId?: string;
};

const ENTRY_POINTS: GridPosition[] = [
  { column: 3, row: 7 },
  { column: 15, row: 7 },
  { column: 28, row: 7 },
  { column: 3, row: 18 },
  { column: 16, row: 18 },
  { column: 28, row: 18 },
];

const CONVERSATION_SPOTS: readonly [
  GridPosition,
  GridPosition,
][] = [
  [{ column: 10, row: 8 }, { column: 11, row: 8 }],
  [{ column: 15, row: 10 }, { column: 16, row: 10 }],
  [{ column: 27, row: 14 }, { column: 28, row: 14 }],
  [{ column: 14, row: 18 }, { column: 15, row: 18 }],
];
const REST_SPOTS: readonly GridPosition[] = [
  { column: 21, row: 16 },
  { column: 7, row: 16 },
  { column: 24, row: 16 },
];
const MIN_PLAYER_DISTANCE = 6;
const SPAWN_DISTANCE = 10;

const ambientLaneAllows = ({ column, row }: GridPosition): boolean =>
  (row >= 7 && row <= 9 && column >= 2 && column <= 29) ||
  (column >= 2 && column <= 5 && row >= 7 && row <= 23) ||
  (column >= 14 && column <= 17 && row >= 7 && row <= 23) ||
  (column >= 27 && column <= 29 && row >= 7 && row <= 23) ||
  (row >= 17 && row <= 18 && column >= 2 && column <= 29) ||
  (column >= 12 && column <= 24 && row >= 10 && row <= 18);

const withAmbientNavigation = (
  blocked: ReadonlySet<string>,
): ReadonlySet<string> => {
  const result = new Set(blocked);
  for (let row = 0; row < 24; row += 1) {
    for (let column = 0; column < 32; column += 1) {
      const position = { column, row };
      if (!ambientLaneAllows(position)) result.add(keyOf(position));
    }
  }
  return result;
};

const EMOJI_BY_KIND: Record<AmbientKind, readonly string[]> = {
  PASSERBY_MAN: ["🙂 💬", "🍉 🤔", "😄 👍"],
  PASSERBY_WOMAN: ["🙂 💬", "🛍️ ✨", "❓ 😄"],
  COOLING_OLDMAN: ["🌿 😌", "🪭 💤", "☀️ 😅"],
  DOG_WALKER: ["🐕 💨", "😅 🐾", "🙂 🐕"],
  DOG: ["🐾 ❗", "🐕 👃", "🍉 ❓"],
};

const SPRITES: Record<
  AmbientModel,
  { left: string; right: string }
> = {
  PASSERBY_MAN: {
    left: "/assets/generated/sprites/ambient/passerby_man_left.png",
    right: "/assets/generated/sprites/ambient/passerby_man_right.png",
  },
  PASSERBY_WOMAN: {
    left: "/assets/generated/sprites/ambient/passerby_woman_left.png",
    right: "/assets/generated/sprites/ambient/passerby_woman_right.png",
  },
  COOLING_OLDMAN: {
    left: "/assets/generated/sprites/ambient/cooling_oldman_left.png",
    right: "/assets/generated/sprites/ambient/cooling_oldman_right.png",
  },
  DELIVERY_WORKER: {
    left: "/assets/generated/sprites/ambient/delivery_worker_left.png",
    right: "/assets/generated/sprites/ambient/delivery_worker.png",
  },
  CYCLIST: {
    left: "/assets/generated/sprites/ambient/cyclist_left.png",
    right: "/assets/generated/sprites/ambient/cyclist.png",
  },
  BASKET_GRANDMA: {
    left: "/assets/generated/sprites/ambient/basket_grandma_left.png",
    right: "/assets/generated/sprites/ambient/basket_grandma.png",
  },
  STREET_DOG: {
    left: "/assets/generated/sprites/ambient/street_dog_left.png",
    right: "/assets/generated/sprites/ambient/street_dog_right.png",
  },
};

const WALK_STEM_BY_MODEL: Partial<Record<AmbientModel, string>> = {
  PASSERBY_MAN: "passerby_man",
  PASSERBY_WOMAN: "passerby_woman",
  COOLING_OLDMAN: "cooling_oldman",
  DELIVERY_WORKER: "delivery_worker",
  CYCLIST: "cyclist",
  BASKET_GRANDMA: "basket_grandma",
  STREET_DOG: "street_dog",
};

export const ambientSprite = (
  entity: AmbientEntity,
  anomalous: boolean,
  hallucinationFrame = 0,
  timestamp = Date.now(),
): string => {
  if (anomalous && entity.kind !== "DOG") {
    return hallucinationSprite(
      hallucinationKindFor(entity.id, timestamp),
      entity.direction,
      hallucinationFrameFor(entity.id, hallucinationFrame),
    );
  }
  if (entity.moving) {
    const stem = WALK_STEM_BY_MODEL[entity.model];
    if (stem) {
      return `/assets/generated/sprites/ambient/${stem}_walk_${entity.frame}_${entity.direction}.png`;
    }
  }
  return SPRITES[entity.model][entity.direction];
};

const pick = <T,>(items: readonly T[]): T =>
  items[Math.floor(Math.random() * items.length)]!;

const keyOf = ({ column, row }: GridPosition) => `${column},${row}`;
const gridDistance = (left: GridPosition, right: GridPosition) =>
  Math.abs(left.column - right.column) +
  Math.abs(left.row - right.row);

const pickEntryOutsideView = (
  player: GridPosition,
): GridPosition | undefined => {
  const candidates = ENTRY_POINTS.filter(
    (entry) => gridDistance(entry, player) >= SPAWN_DISTANCE,
  );
  return candidates.length > 0 ? pick(candidates) : undefined;
};

const pickConversationSpot = (
  player: GridPosition,
): readonly [GridPosition, GridPosition] | undefined => {
  const candidates = CONVERSATION_SPOTS.filter(
    ([first, second]) =>
      gridDistance(first, player) >= MIN_PLAYER_DISTANCE &&
      gridDistance(second, player) >= MIN_PLAYER_DISTANCE,
  );
  return candidates.length > 0 ? pick(candidates) : undefined;
};

const pickRestSpot = (player: GridPosition): GridPosition | undefined => {
  const candidates = REST_SPOTS.filter(
    (spot) => gridDistance(spot, player) >= MIN_PLAYER_DISTANCE,
  );
  return candidates.length > 0 ? pick(candidates) : undefined;
};

const HUMAN_MODELS: readonly AmbientModel[] = [
  "PASSERBY_MAN",
  "PASSERBY_WOMAN",
  "DELIVERY_WORKER",
  "CYCLIST",
  "BASKET_GRANDMA",
  "COOLING_OLDMAN",
];

const pickUnusedModels = (
  usedModels: ReadonlySet<AmbientModel>,
  count: number,
  preferred: readonly AmbientModel[] = HUMAN_MODELS,
): AmbientModel[] => {
  const available = preferred.filter((model) => !usedModels.has(model));
  if (available.length < count) return [];
  return [...available].sort(() => Math.random() - 0.5).slice(0, count);
};

const buildEntity = (
  kind: AmbientKind,
  model: AmbientModel,
  scenarioId: string,
  blocked: ReadonlySet<string>,
  now: number,
  player: GridPosition,
  start?: GridPosition,
  destination?: GridPosition,
  phase: AmbientEntity["phase"] = "LEAVING",
): AmbientEntity | null => {
  const from = start ?? pickEntryOutsideView(player);
  if (!from || gridDistance(from, player) < SPAWN_DISTANCE) return null;
  let to =
    destination ??
    pickEntryOutsideView(player) ??
    pick(ENTRY_POINTS);
  for (
    let attempt = 0;
    attempt < 6 && keyOf(from) === keyOf(to);
    attempt += 1
  ) {
    to = pickEntryOutsideView(player) ?? pick(ENTRY_POINTS);
  }
  if (blocked.has(keyOf(from))) return null;
  const path = findGridPath(from, to, withAmbientNavigation(blocked));
  if (path.length === 0) return null;
  const id = `${scenarioId}-${kind.toLowerCase()}-${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    scenarioId,
    kind,
    model,
    position: from,
    direction: to.column < from.column ? "left" : "right",
    frame: 0,
    moving: true,
    path,
    goal: to,
    stepIndex: 0,
    phase,
    exit: pickEntryOutsideView(player) ?? pick(ENTRY_POINTS),
    emoji: pick(EMOJI_BY_KIND[kind]),
    bornAt: now,
    expiresAt:
      now + (kind === "COOLING_OLDMAN" ? 28_000 : 20_000 + Math.random() * 8_000),
  };
};

const spawnScenario = (
  blocked: ReadonlySet<string>,
  phase: DayPhase,
  now: number,
  player: GridPosition,
  usedModels: ReadonlySet<AmbientModel>,
): AmbientEntity[] => {
  const scenarioId = `ambient-${now}-${Math.random().toString(36).slice(2, 6)}`;
  const roll = Math.random();

  if (roll < 0.27) {
    if (usedModels.has("STREET_DOG")) return [];
    const walkerModel = pickUnusedModels(
      usedModels,
      1,
      ["DELIVERY_WORKER", "PASSERBY_MAN", "BASKET_GRANDMA"],
    )[0];
    if (!walkerModel) return [];
    const from = pickEntryOutsideView(player);
    if (!from) return [];
    let to = pickEntryOutsideView(player) ?? pick(ENTRY_POINTS);
    while (keyOf(from) === keyOf(to)) to = pick(ENTRY_POINTS);
    const walker = buildEntity(
      "DOG_WALKER",
      walkerModel,
      scenarioId,
      blocked,
      now,
      player,
      from,
      to,
    );
    if (!walker) return [];
    const dog = buildEntity(
      "DOG",
      "STREET_DOG",
      scenarioId,
      blocked,
      now,
      player,
      from,
      to,
    );
    if (!dog) return [walker];
    dog.ownerId = walker.id;
    dog.path = walker.path;
    dog.exit = walker.exit;
    dog.expiresAt = walker.expiresAt;
    return [walker, dog];
  }

  if (roll < 0.48 && phase !== "NIGHT") {
    if (usedModels.has("COOLING_OLDMAN")) return [];
    const restSpot = pickRestSpot(player);
    if (!restSpot) return [];
    const oldman = buildEntity(
      "COOLING_OLDMAN",
      "COOLING_OLDMAN",
      scenarioId,
      blocked,
      now,
      player,
      undefined,
      restSpot,
      "ENTERING",
    );
    if (oldman) {
      oldman.exit =
        pickEntryOutsideView(player) ?? pick(ENTRY_POINTS);
      oldman.goal = oldman.exit;
      oldman.expiresAt = now + 34_000;
    }
    return oldman ? [oldman] : [];
  }

  if (roll < 0.72) {
    const pairModels = pickUnusedModels(usedModels, 2, [
      "PASSERBY_MAN",
      "PASSERBY_WOMAN",
      "DELIVERY_WORKER",
      "CYCLIST",
      "BASKET_GRANDMA",
    ]);
    if (pairModels.length !== 2) return [];
    const spots = pickConversationSpot(player);
    if (!spots) return [];
    const [firstSpot, secondSpot] = spots;
    const from = pickEntryOutsideView(player);
    const secondFrom = pickEntryOutsideView(player);
    if (!from || !secondFrom) return [];
    if (keyOf(from) === keyOf(secondFrom)) return [];
    const first = buildEntity(
      "PASSERBY_MAN",
      pairModels[0]!,
      scenarioId,
      blocked,
      now,
      player,
      from,
      firstSpot,
      "ENTERING",
    );
    const second = buildEntity(
      "PASSERBY_WOMAN",
      pairModels[1]!,
      scenarioId,
      blocked,
      now,
      player,
      secondFrom,
      secondSpot,
      "ENTERING",
    );
    if (first && second) {
      first.partnerId = second.id;
      second.partnerId = first.id;
      first.exit =
        pickEntryOutsideView(player) ?? pick(ENTRY_POINTS);
      second.exit =
        pickEntryOutsideView(player) ?? pick(ENTRY_POINTS);
      first.goal = first.exit;
      second.goal = second.exit;
      first.expiresAt = now + 32_000;
      second.expiresAt = first.expiresAt;
    }
    const survivors = [first, second].filter(
      (entity): entity is AmbientEntity => Boolean(entity),
    );
    for (const entity of survivors) {
      if (entity.partnerId) continue;
      entity.phase = "LEAVING";
      entity.goal = entity.exit;
      entity.path = findGridPath(
        entity.position,
        entity.exit,
        withAmbientNavigation(blocked),
      );
      entity.stepIndex = 0;
      entity.moving = entity.path.length > 0;
    }
    return survivors;
  }

  const model = pickUnusedModels(usedModels, 1, [
    "PASSERBY_MAN",
    "PASSERBY_WOMAN",
    "DELIVERY_WORKER",
    "CYCLIST",
    "BASKET_GRANDMA",
  ])[0];
  if (!model) return [];
  const kind: AmbientKind =
    model === "PASSERBY_MAN" || model === "DELIVERY_WORKER"
      ? "PASSERBY_MAN"
      : "PASSERBY_WOMAN";
  const entity = buildEntity(
    kind,
    model,
    scenarioId,
    blocked,
    now,
    player,
  );
  return entity ? [entity] : [];
};

export const useAmbientWorld = ({
  player,
  blocked,
  phase,
  sanStage,
}: {
  player: PlayerRuntimeState;
  blocked: ReadonlySet<string>;
  phase: DayPhase;
  sanStage: SanStage;
}): AmbientEntity[] => {
  const [entities, setEntities] = useState<AmbientEntity[]>([]);
  const playerRef = useRef(player);
  const blockedRef = useRef(blocked);
  playerRef.current = player;
  blockedRef.current = blocked;

  useEffect(() => {
    const movement = window.setInterval(() => {
      const now = Date.now();
      setEntities((current) => {
        let prepared = current
          .filter((entity) => entity.expiresAt > now)
          .map((entity) => ({ ...entity }));
        const byScenario = new Map<string, AmbientEntity[]>();
        for (const entity of prepared) {
          if (!entity.partnerId) continue;
          const group = byScenario.get(entity.scenarioId) ?? [];
          group.push(entity);
          byScenario.set(entity.scenarioId, group);
        }
        for (const group of byScenario.values()) {
          if (
            group.length === 2 &&
            group.every(
              (entity) =>
                entity.phase === "ENTERING" &&
                entity.stepIndex >= entity.path.length,
            )
          ) {
            const [left, right] = [...group].sort(
              (a, b) => a.position.column - b.position.column,
            );
            left!.phase = "CHATTING";
            right!.phase = "CHATTING";
            left!.phaseUntil = now + 5_500;
            right!.phaseUntil = now + 5_500;
            left!.direction = "right";
            right!.direction = "left";
            left!.moving = false;
            right!.moving = false;
            left!.frame = 0;
            right!.frame = 0;
          } else if (
            group.length === 2 &&
            group.every(
              (entity) =>
                entity.phase === "CHATTING" &&
                (entity.phaseUntil ?? 0) <= now,
            )
          ) {
            for (const entity of group) {
              entity.phase = "LEAVING";
              entity.exit =
                pickEntryOutsideView(playerRef.current) ?? entity.exit;
              entity.goal = entity.exit;
              entity.path = findGridPath(
                entity.position,
                entity.exit,
                withAmbientNavigation(blockedRef.current),
              );
              entity.stepIndex = 0;
              entity.moving = entity.path.length > 0;
            }
          }
        }

        for (const entity of prepared) {
          if (
            entity.phase === "LEAVING" &&
            gridDistance(entity.exit, playerRef.current) < SPAWN_DISTANCE
          ) {
            entity.exit =
              pickEntryOutsideView(playerRef.current) ?? entity.exit;
            entity.goal = entity.exit;
            entity.path = findGridPath(
              entity.position,
              entity.exit,
              withAmbientNavigation(blockedRef.current),
            );
            entity.stepIndex = 0;
          }
          if (
            (entity.phase === "CHATTING" || entity.phase === "RESTING") &&
            gridDistance(entity.position, playerRef.current) <
              MIN_PLAYER_DISTANCE
          ) {
            entity.phase = "LEAVING";
            entity.exit =
              pickEntryOutsideView(playerRef.current) ?? entity.exit;
            entity.goal = entity.exit;
            entity.path = findGridPath(
              entity.position,
              entity.exit,
              withAmbientNavigation(blockedRef.current),
            );
            entity.stepIndex = 0;
            entity.moving = entity.path.length > 0;
            entity.phaseUntil = undefined;
          }
          if (
            entity.kind === "COOLING_OLDMAN" &&
            entity.phase === "ENTERING" &&
            entity.stepIndex >= entity.path.length
          ) {
            entity.phase = "RESTING";
            entity.phaseUntil = now + 9_000;
            entity.moving = false;
            entity.frame = 0;
          } else if (
            entity.kind === "COOLING_OLDMAN" &&
            entity.phase === "RESTING" &&
            (entity.phaseUntil ?? 0) <= now
          ) {
            entity.phase = "LEAVING";
            entity.exit =
              pickEntryOutsideView(playerRef.current) ?? entity.exit;
            entity.goal = entity.exit;
            entity.path = findGridPath(
              entity.position,
              entity.exit,
              withAmbientNavigation(blockedRef.current),
            );
            entity.stepIndex = 0;
            entity.moving = entity.path.length > 0;
          }
        }

        const reserved = new Set<string>([
          ...Array.from({ length: 32 }, (_, column) => column)
            .flatMap((column) =>
              Array.from({ length: 24 }, (_, row) => ({ column, row })),
            )
            .filter(
              (position) =>
                gridDistance(position, playerRef.current) < 3,
            )
            .map(keyOf),
          ...prepared
            .filter((entity) => entity.kind !== "DOG")
            .map((entity) => keyOf(entity.position)),
        ]);
        prepared = prepared.map((entity) => {
            if (entity.kind === "DOG") return entity;
            if (
              entity.phase === "CHATTING" ||
              entity.phase === "RESTING" ||
              entity.stepIndex >= entity.path.length
            ) {
              return { ...entity, moving: false, frame: 0 };
            }
            const nextPosition = entity.path[entity.stepIndex]!;
            if (
              reserved.has(keyOf(nextPosition)) &&
              keyOf(nextPosition) !== keyOf(entity.position)
            ) {
              const blockedSince = entity.blockedSince ?? now;
              if (now - blockedSince < 1_000) {
                return {
                  ...entity,
                  moving: false,
                  blockedSince,
                };
              }
              const rerouteTarget =
                entity.phase === "ENTERING"
                  ? entity.goal
                  : entity.exit;
              const reroutedPath = findGridPath(
                entity.position,
                rerouteTarget,
                withAmbientNavigation(blockedRef.current),
              );
              if (reroutedPath.length > 0) {
                return {
                  ...entity,
                  path: reroutedPath,
                  goal: rerouteTarget,
                  stepIndex: 0,
                  moving: true,
                  blockedSince: undefined,
                };
              }
              const fallbackExit =
                pickEntryOutsideView(playerRef.current) ?? entity.exit;
              const fallbackPath = findGridPath(
                entity.position,
                fallbackExit,
                withAmbientNavigation(blockedRef.current),
              );
              return {
                ...entity,
                phase: "LEAVING",
                exit: fallbackExit,
                goal: fallbackExit,
                path: fallbackPath,
                stepIndex: 0,
                moving: fallbackPath.length > 0,
                blockedSince: undefined,
              };
            }
            reserved.delete(keyOf(entity.position));
            reserved.add(keyOf(nextPosition));
            return {
              ...entity,
              moving: true,
              frame: (entity.frame + 1) % 4,
              direction:
                nextPosition.column < entity.position.column
                  ? "left"
                  : nextPosition.column > entity.position.column
                    ? "right"
                    : entity.direction,
              position: nextPosition,
              stepIndex: entity.stepIndex + 1,
              blockedSince: undefined,
            };
          });
        const movedById = new Map(
          prepared.map((entity) => [entity.id, entity]),
        );
        prepared = prepared.filter(
          (entity) =>
            !(
              entity.phase === "LEAVING" &&
              entity.stepIndex >= entity.path.length
            ),
        );
        const liveIds = new Set(prepared.map((entity) => entity.id));
        return prepared.filter(
          (entity) =>
            entity.kind !== "DOG" ||
            !entity.ownerId ||
            liveIds.has(entity.ownerId),
        ).map((entity) => {
          if (entity.kind !== "DOG" || !entity.ownerId) return entity;
          const owner = movedById.get(entity.ownerId);
          if (!owner) return entity;
          const followIndex = Math.max(0, owner.stepIndex - 2);
          const followPosition =
            owner.path[followIndex] ?? owner.position;
          return {
            ...entity,
            position: followPosition,
            direction: owner.direction,
            moving: owner.moving,
            frame: owner.moving ? (entity.frame + 1) % 4 : 0,
            stepIndex: followIndex,
          };
        });
      });
    }, 240);
    return () => window.clearInterval(movement);
  }, []);

  useEffect(() => {
    const ensureDensity = () => {
      setEntities((current) => {
        const people = current.filter((entity) => entity.kind !== "DOG").length;
        const target = sanStage === "ANOMALY" ? 4 : phase === "NIGHT" ? 5 : 6;
        if (people >= target) return current;
        const usedModels = new Set(
          current.map((entity) => entity.model),
        );
        return [
          ...current,
          ...spawnScenario(
            blockedRef.current,
            phase,
            Date.now(),
            playerRef.current,
            usedModels,
          ),
        ].slice(
          -8,
        );
      });
    };
    ensureDensity();
    const spawning = window.setInterval(ensureDensity, 2_500);
    return () => window.clearInterval(spawning);
  }, [phase, sanStage]);

  return entities;
};

export const ambientEmojiVisible = (
  entity: AmbientEntity,
  timestamp: number,
): boolean => {
  if (entity.partnerId) {
    return (
      entity.phase === "CHATTING" &&
      entity.id.localeCompare(entity.partnerId) < 0
    );
  }
  if (entity.phase === "RESTING") return true;
  const offset = entity.id.length * 371;
  return (timestamp + offset) % 9_000 < 2_800;
};
