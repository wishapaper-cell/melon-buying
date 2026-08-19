import type {
  InteractionMode,
  InteractiveSceneObject,
  PersistedObjectState,
} from "../shared/types";

export type VisualComposition = {
  baseState: string;
  interactionOverlay: InteractionMode | null;
  assetKey: string;
  effects: string[];
};

export const composeVisualState = (
  object: InteractiveSceneObject,
  persisted: PersistedObjectState,
  mode: InteractionMode,
): VisualComposition => {
  const baseState = object.availableVisualStates.includes(
    persisted.visualState,
  )
    ? persisted.visualState
    : object.currentVisualState;
  if (mode === "DEFAULT") {
    return {
      baseState,
      interactionOverlay: null,
      assetKey: `${object.prefabId}_${baseState.toLowerCase()}`,
      effects: [],
    };
  }
  return {
    baseState,
    interactionOverlay: mode,
    assetKey: `${object.prefabId}_${baseState.toLowerCase()}`,
    effects:
      mode === "HOVER"
        ? ["pixel-outline", "interaction-pip"]
        : ["strong-outline", "scene-dim", "object-label"],
  };
};
