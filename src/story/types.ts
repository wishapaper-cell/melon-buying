import type { GridPosition } from "../game/isometric";

export type StoryChoiceId = "A" | "B" | "C";
export type StoryCharacterId = string;
export type StoryPose = string;

export type DirectionalSprites = {
  left: string;
  right: string;
};

export type MouthAnimationDefinition = {
  left: { x: number; y: number };
  right: { x: number; y: number };
  width: number;
  height: number;
  color: string;
  openColor?: string;
  intervalMs: number;
};

export type StoryExpressionDefinition = {
  pose: StoryPose;
  animation: string;
  sprites?: string | DirectionalSprites;
  portrait?: string;
  mouth?: MouthAnimationDefinition;
};

export type StoryCharacterDefinition = {
  displayName: string;
  initialPosition: GridPosition;
  defaultExpression: string;
  expressions: Record<string, StoryExpressionDefinition>;
};

export type StoryChoice = {
  id: StoryChoiceId;
  label: string;
  description: string;
  next: string;
  canonical: boolean;
  tensionDelta: number;
  sanDelta?: number;
};

export type StoryStagePlacement = {
  destination: GridPosition;
  faceTarget?: GridPosition;
};

export type StorySpriteSheetFrame = {
  asset: string;
  columns: number;
  rows: number;
  frame: number;
};

export type StorySequenceCharacterState = {
  position?: GridPosition;
  expression?: string;
  facing?: "left" | "right";
  motion?: "idle" | "walk" | "reach" | "lift" | "hold" | "pat" | "present";
  spriteSheet?: StorySpriteSheetFrame | null;
};

export type StorySequenceBeat = {
  id: string;
  label: string;
  durationMs: number;
  bubble?: boolean;
  characters: Partial<Record<StoryCharacterId, StorySequenceCharacterState>>;
  props: Record<string, { state: string; position?: GridPosition }>;
};

export type StorySequence = {
  beats: StorySequenceBeat[];
};

export type StoryNode = {
  id: string;
  chapter: string;
  speaker: StoryCharacterId;
  speakerName: string;
  narration: string;
  dialogue?: string;
  stageDirection: string;
  pose: Partial<Record<StoryCharacterId, StoryPose>>;
  expressions: Partial<Record<StoryCharacterId, string>>;
  characterPositions: Partial<Record<StoryCharacterId, GridPosition>>;
  stagePlacement?: StoryStagePlacement;
  speechBubble: {
    visible: boolean;
    maxWidth: number;
    offsetY: number;
  };
  sequence?: StorySequence;
  choices: readonly StoryChoice[];
  autoAdvanceTo?: string;
  autoAdvanceMs?: number;
  ending?: "CANON" | "DETOUR" | "PEACEFUL";
};

export type StoryRuntime = {
  nodeId: string;
  route: string[];
  tension: number;
  san: number;
  canonRouteActive: boolean;
  selectedChoice: StoryChoiceId | null;
};

export type StoryDocument = {
  formatVersion: 1;
  id: string;
  title: string;
  description?: string;
  entryNodeId: string;
  canonRoute: string[];
  characters: Record<string, StoryCharacterDefinition>;
  nodes: StoryNode[];
};
