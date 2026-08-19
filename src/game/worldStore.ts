import { MELON_STREET_OBJECTS } from "./catalog";
import { MELON_STREET_NPCS } from "./npcs";
import type {
  ActionResult,
  PersistedObjectState,
  VoteHistoryEntry,
  WorldState,
} from "../shared/types";
import {
  createObjectRuntime,
  initialVisualStateFor,
  isAllowedVisualState,
} from "./objectRuntime";

export const WORLD_STORAGE_KEY = "huaqiang-world-state-v2";
const LEGACY_WORLD_STORAGE_KEY = "huaqiang-world-state-v1";

export type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export const createInitialWorldState = (): WorldState => {
  const objectStates = Object.fromEntries(
    MELON_STREET_OBJECTS.map((object) => [
      object.id,
      {
        ...createObjectRuntime(object.id, {
          column: Math.round(object.position.x / 3),
          row: Math.round(object.position.y / 3),
        }, clone(object.facts)),
        facts: clone(object.facts),
        discovered: object.discovered,
        localMemory: [],
      } satisfies PersistedObjectState,
    ]),
  );

  return {
    version: 2,
    worldlineId: crypto.randomUUID(),
    worldRevision: 1,
    currentSceneId: "melon_street",
    objectStates,
    knownFacts: ["scale_available", "knife_available"],
    inventory: [],
    relationships: {
      HUAQIANG_TO_VENDOR: -10,
      HUAQIANG_TO_VENDOR_ASSISTANT: 0,
      HUAQIANG_TO_ONLOOKER_01: 5,
    },
    npcEmotions: Object.fromEntries(
      MELON_STREET_NPCS.map((npc) => [npc.id, npc.emotion]),
    ),
    tension: 18,
    streetOpinion: 0,
    currentTime: new Date().toISOString(),
    timezone: "Asia/Shanghai",
    san: 80,
    sanStage: "NORMAL",
    canonRouteActive: true,
    canonBeatId: "price_question",
    recentEvents: [],
    voteHistory: [],
  };
};

const isValidWorldState = (value: unknown): value is WorldState => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<WorldState>;
  return (
    candidate.version === 2 &&
    typeof candidate.worldlineId === "string" &&
    typeof candidate.currentSceneId === "string" &&
    !!candidate.objectStates
  );
};

export class WorldStore {
  private state: WorldState;
  private snapshot: WorldState;
  private readonly listeners = new Set<(state: WorldState) => void>();

  constructor(private readonly storage?: StorageLike) {
    const stored =
      storage?.getItem(WORLD_STORAGE_KEY) ??
      storage?.getItem(LEGACY_WORLD_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as unknown;
        this.state = isValidWorldState(parsed)
          ? this.mergeCatalogDefaults(parsed)
          : this.migrateLegacyState(parsed);
      } catch {
        this.state = createInitialWorldState();
      }
    } else {
      this.state = createInitialWorldState();
    }
    this.snapshot = clone(this.state);
    this.persist();
  }

  getSnapshot = (): WorldState => this.snapshot;

  subscribe = (listener: (state: WorldState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  reset = (): void => {
    this.state = createInitialWorldState();
    this.commit();
  };

  updateObjectState = (
    objectId: string,
    visualState: string,
    facts: Record<string, boolean | number | string> = {},
  ): void => {
    const current = this.state.objectStates[objectId];
    if (!current) return;
    if (isAllowedVisualState(objectId, visualState)) {
      current.visualState = visualState;
    }
    current.facts = { ...current.facts, ...facts };
    this.commit();
  };

  applyActionResult = (result: ActionResult): void => {
    if (result.targetObjectId) {
      const objectState = this.state.objectStates[result.targetObjectId];
      if (objectState) {
        if (result.nextObjectState) {
          if (
            isAllowedVisualState(
              result.targetObjectId,
              result.nextObjectState,
            )
          ) {
            objectState.visualState = result.nextObjectState;
          }
        }
        objectState.facts = {
          ...objectState.facts,
          ...result.changedFacts,
        };
        objectState.localMemory.push({
          id: result.newEvent.id,
          timestamp: result.newEvent.timestamp,
          actorId: result.actorId,
          actionType: result.actionType,
          summary: result.summary,
        });
        objectState.localMemory = objectState.localMemory.slice(-30);
      }
    }

    for (const [objectId, nextState] of Object.entries(
      result.objectStateChanges,
    )) {
      const objectState = this.state.objectStates[objectId];
      if (!objectState) continue;
      if (isAllowedVisualState(objectId, nextState)) {
        objectState.visualState = nextState;
      }
      objectState.discovered = true;
    }

    this.state.knownFacts = Array.from(
      new Set([...this.state.knownFacts, ...result.revealedFacts]),
    );
    this.state.inventory = Array.from(
      new Set([...this.state.inventory, ...result.inventoryAdds]),
    );
    for (const [key, delta] of Object.entries(result.relationshipDelta)) {
      this.state.relationships[key] =
        (this.state.relationships[key] ?? 0) + delta;
    }
    this.state.tension = Math.max(
      0,
      Math.min(100, this.state.tension + result.tensionDelta),
    );
    this.state.recentEvents.push(result.newEvent);
    this.state.recentEvents = this.state.recentEvents.slice(-20);
    this.commit();
  };

  recordVote = (entry: VoteHistoryEntry): void => {
    this.state.voteHistory.push(entry);
    this.state.voteHistory = this.state.voteHistory.slice(-20);
    this.commit();
  };

  markCanonDeviation = (): void => {
    this.state.canonRouteActive = false;
    this.state.canonBeatId = null;
    this.commit();
  };

  private mergeCatalogDefaults(state: WorldState): WorldState {
    const next = clone(state);
    for (const object of MELON_STREET_OBJECTS) {
      if (!next.objectStates[object.id]) {
        next.objectStates[object.id] = {
          ...createObjectRuntime(object.id, undefined, clone(object.facts)),
          facts: clone(object.facts),
          discovered: object.discovered,
          localMemory: [],
        };
      }
    }
    return next;
  }

  private migrateLegacyState(value: unknown): WorldState {
    const next = createInitialWorldState();
    if (!value || typeof value !== "object") return next;
    const legacy = value as {
      worldlineId?: unknown;
      objectStates?: Record<
        string,
        {
          baseVisualState?: unknown;
          facts?: unknown;
          discovered?: unknown;
          localMemory?: unknown;
        }
      >;
      knownFacts?: unknown;
      inventory?: unknown;
      relationships?: unknown;
      npcEmotions?: unknown;
      tension?: unknown;
      streetOpinion?: unknown;
      canonRouteActive?: unknown;
      canonBeatId?: unknown;
      recentEvents?: unknown;
      voteHistory?: unknown;
    };
    if (typeof legacy.worldlineId === "string") {
      next.worldlineId = legacy.worldlineId;
    }
    for (const [objectId, previous] of Object.entries(
      legacy.objectStates ?? {},
    )) {
      const current = next.objectStates[objectId];
      if (!current) continue;
      const previousState =
        typeof previous.baseVisualState === "string"
          ? previous.baseVisualState
          : "";
      current.visualState = isAllowedVisualState(objectId, previousState)
        ? previousState
        : initialVisualStateFor(objectId);
      if (previous.facts && typeof previous.facts === "object") {
        current.facts = {
          ...current.facts,
          ...(previous.facts as Record<string, boolean | number | string>),
        };
      }
      current.discovered =
        typeof previous.discovered === "boolean"
          ? previous.discovered
          : current.discovered;
      if (Array.isArray(previous.localMemory)) {
        current.localMemory =
          previous.localMemory as PersistedObjectState["localMemory"];
      }
    }
    if (Array.isArray(legacy.knownFacts)) {
      next.knownFacts = legacy.knownFacts as string[];
    }
    if (Array.isArray(legacy.inventory)) {
      next.inventory = legacy.inventory as string[];
    }
    if (legacy.relationships && typeof legacy.relationships === "object") {
      next.relationships = legacy.relationships as Record<string, number>;
    }
    if (legacy.npcEmotions && typeof legacy.npcEmotions === "object") {
      next.npcEmotions = legacy.npcEmotions as WorldState["npcEmotions"];
    }
    if (typeof legacy.tension === "number") next.tension = legacy.tension;
    if (typeof legacy.streetOpinion === "number") {
      next.streetOpinion = legacy.streetOpinion;
    }
    if (typeof legacy.canonRouteActive === "boolean") {
      next.canonRouteActive = legacy.canonRouteActive;
    }
    if (
      typeof legacy.canonBeatId === "string" ||
      legacy.canonBeatId === null
    ) {
      next.canonBeatId = legacy.canonBeatId;
    }
    if (Array.isArray(legacy.recentEvents)) {
      next.recentEvents = legacy.recentEvents as WorldState["recentEvents"];
    }
    if (Array.isArray(legacy.voteHistory)) {
      next.voteHistory = legacy.voteHistory as WorldState["voteHistory"];
    }
    return next;
  }

  private persist(): void {
    this.storage?.setItem(WORLD_STORAGE_KEY, JSON.stringify(this.state));
  }

  private commit(): void {
    this.state.worldRevision += 1;
    this.snapshot = clone(this.state);
    this.persist();
    this.listeners.forEach((listener) => listener(this.snapshot));
  }
}
