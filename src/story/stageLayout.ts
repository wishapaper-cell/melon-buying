import type { GridPosition } from "../game/isometric";
import { MELON_STORY } from "./melonStory";

export type StagePlacement = {
  destination: GridPosition;
  faceTarget?: GridPosition;
};

export const getStagePlacement = (
  nextNodeId: string,
  fallback?: GridPosition,
): StagePlacement | null =>
  MELON_STORY[nextNodeId]?.stagePlacement ??
  (fallback ? { destination: fallback } : null);

export const horizontalFacing = (
  position: GridPosition,
  target?: GridPosition,
  fallback: "left" | "right" = "right",
): "left" | "right" => {
  if (!target || target.column === position.column) return fallback;
  return target.column < position.column ? "left" : "right";
};

export const isAdjacentTo = (
  left: GridPosition,
  right: GridPosition,
): boolean =>
  Math.abs(left.column - right.column) + Math.abs(left.row - right.row) === 1;
