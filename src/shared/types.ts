export type ObjectCategory =
  | "PROP"
  | "FURNITURE"
  | "TOOL"
  | "CONTAINER"
  | "VEHICLE"
  | "BUILDING"
  | "DECORATION"
  | "PORTAL"
  | "EVIDENCE";

export type InteractionMode = "DEFAULT" | "HOVER" | "FOCUSED";

export type ActionType =
  | "OBSERVE"
  | "INSPECT"
  | "QUESTION"
  | "NEGOTIATE"
  | "ACCUSE"
  | "WEIGH"
  | "MOVE"
  | "USE"
  | "CUT"
  | "HOLD"
  | "SHOW_EVIDENCE"
  | "REPAIR"
  | "RIDE"
  | "SIT"
  | "OPEN"
  | "CALL"
  | "LEAVE"
  | "WAIT";

export type Emotion =
  | "CALM"
  | "CONFIDENT"
  | "SUSPICIOUS"
  | "ANNOYED"
  | "ANGRY"
  | "NERVOUS"
  | "AFRAID"
  | "SARCASTIC";

export type WorldCondition = {
  fact: string;
  operator: "EQUALS" | "NOT_EQUALS" | "EXISTS" | "NOT_EXISTS";
  value?: boolean | number | string;
};

export type ObjectMemoryEntry = {
  id: string;
  timestamp: number;
  actorId: string;
  actionType: ActionType;
  summary: string;
};

export type ObjectTransition = {
  actionType: ActionType;
  fromStates?: string[];
  toState?: string;
  requiredFacts?: string[];
  forbiddenFacts?: string[];
  setsFacts?: Record<string, boolean | number | string>;
  revealsFacts?: string[];
  inventoryAdds?: string[];
  tensionDelta?: number;
  relationshipDelta?: Record<string, number>;
  objectStateChanges?: Record<string, string>;
  dialogueShouldContinue?: boolean;
  animationCue?: string;
  resultSummary: string;
};

export type InteractiveSceneObject = {
  id: string;
  prefabId: string;
  displayName: string;
  description: string;
  sceneId: string;
  category: ObjectCategory;
  position: { x: number; y: number };
  size: { width: number; height: number };
  zIndex: number;
  currentVisualState: string;
  availableVisualStates: string[];
  interactionRadius: number;
  enabled: boolean;
  discoverable: boolean;
  discovered: boolean;
  tags: string[];
  supportedActions: ActionType[];
  stateActionOverrides?: Record<string, ActionType[]>;
  facts: Record<string, boolean | number | string>;
  localMemory: ObjectMemoryEntry[];
  transitions: ObjectTransition[];
  requiredConditions?: WorldCondition[];
  blockedConditions?: WorldCondition[];
};

export type InteractiveNpc = {
  id: string;
  displayName: string;
  sceneId: string;
  position: { x: number; y: number };
  interactionRadius: number;
  supportedActions: ActionType[];
  emotion: Emotion;
  goal: string;
  personality: string[];
  knownFacts: string[];
  allowedAnimations: string[];
};

export type PersistedObjectState = {
  visualState: string;
  anchor: {
    type: "WORLD" | "CHARACTER" | "PROP" | "REMOVED";
    targetId?: string;
    socket?: "LEFT_HAND" | "RIGHT_HAND" | "BOTH_HANDS" | "SURFACE";
    gridPosition?: { column: number; row: number };
  };
  facts: Record<string, boolean | number | string>;
  discovered: boolean;
  localMemory: ObjectMemoryEntry[];
  reservedBy?: string;
};

export type VoteHistoryEntry = {
  interactionId: string;
  winningOptionId: OptionId;
  counts: Record<OptionId, number>;
  timestamp: number;
};

export type RecentEvent = {
  id: string;
  timestamp: number;
  summary: string;
  objectId?: string;
  npcId?: string;
};

export type WorldState = {
  version: 2;
  worldlineId: string;
  worldRevision: number;
  currentSceneId: string;
  objectStates: Record<string, PersistedObjectState>;
  knownFacts: string[];
  inventory: string[];
  relationships: Record<string, number>;
  npcEmotions: Record<string, Emotion>;
  tension: number;
  streetOpinion: number;
  currentTime: string;
  timezone: "Asia/Shanghai";
  san: number;
  sanStage: "NORMAL" | "HALLUCINATION" | "ANOMALY";
  canonRouteActive: boolean;
  canonBeatId: string | null;
  recentEvents: RecentEvent[];
  voteHistory: VoteHistoryEntry[];
};

export type OptionId = "A" | "B" | "C" | "D" | "E";
export type GeneratedOptionId = Exclude<OptionId, "E">;

export type RuntimeOption = {
  id: GeneratedOptionId;
  shortLabel: string;
  description: string;
  actionType: ActionType;
  actorId: string;
  targetObjectId?: string;
  targetNpcId?: string;
  targetSceneId?: string;
  intent: string;
  expectedTone: string;
  canonical: boolean;
  requiredObjects: string[];
  requiredFacts: string[];
  forbiddenFacts: string[];
  animationCue: string;
  objectStatePreview?: string;
  riskLevel: 1 | 2 | 3 | 4 | 5;
};

export type LiveOption = Omit<RuntimeOption, "id"> & { id: OptionId };

export type RuntimeInteractionOptions = {
  interactionId: string;
  sceneId: string;
  objectId: string;
  actorId: string;
  options: [RuntimeOption, RuntimeOption, RuntimeOption, RuntimeOption];
  generationContextHash: string;
  degraded: boolean;
  notice?: string;
};

export type InteractionTargetKind = "OBJECT" | "NPC";

export type InteractionContext = {
  actorId: string;
  sceneId: string;
  objectId: string;
  targetDisplayName: string;
  targetKind: InteractionTargetKind;
  objectState: string;
  objectFacts: Record<string, boolean | number | string>;
  supportedActions: ActionType[];
  nearbyNpcIds: string[];
  npcEmotions: Record<string, Emotion>;
  npcGoals: Record<string, string>;
  knownFacts: string[];
  unknownFacts: string[];
  unknownFactLabels: Record<string, string>;
  relationships: Record<string, number>;
  recentEvents: RecentEvent[];
  inventory: string[];
  tension: number;
  streetOpinion: number;
  currentTime: string;
  availableExitIds: string[];
  availableObjectIds: string[];
  canonBeatId: string | null;
  canonRouteActive: boolean;
  voteHistory: VoteHistoryEntry[];
  worldlineId: string;
};

export type Proposal = {
  id: string;
  messageId: string;
  viewerId: string;
  viewerName: string;
  text: string;
  timestamp: number;
};

export type ActionResult = {
  success: boolean;
  actorId: string;
  targetObjectId?: string;
  targetNpcId?: string;
  actionType: ActionType;
  previousObjectState?: string;
  nextObjectState?: string;
  changedFacts: Record<string, boolean | number | string>;
  revealedFacts: string[];
  inventoryAdds: string[];
  relationshipDelta: Record<string, number>;
  objectStateChanges: Record<string, string>;
  tensionDelta: number;
  newEvent: RecentEvent;
  animationCue: string;
  dialogueShouldContinue: boolean;
  summary: string;
};

export type GeneratedDialogueTurn = {
  speakerId: string;
  text: string;
  emotion: Emotion;
  animationCue: string;
  facePortraitState: string;
  cameraCue?: string;
  addressedTo?: string;
  revealedFacts?: string[];
  concealedFacts?: string[];
  conversationShouldContinue: boolean;
};

export type DialogueGenerationContext = {
  option: LiveOption;
  actionResult: ActionResult;
  objectState: string;
  newFacts: string[];
  speakerIds: string[];
  relationships: Record<string, number>;
  emotions: Record<string, Emotion>;
  goals: Record<string, string>;
  recentDialogue: GeneratedDialogueTurn[];
  recentEvents: RecentEvent[];
  tension: number;
  allowedFacts: string[];
  forbiddenFacts: string[];
  forbiddenFactLabels: Record<string, string>;
  canonFixedLine?: string;
};

export type BilibiliDanmakuEvent = {
  cmd: "LIVE_OPEN_PLATFORM_DM";
  data: {
    room_id: number;
    open_id: string;
    union_id?: string;
    uname: string;
    msg: string;
    msg_id: string;
    timestamp: number;
    uface?: string;
    dm_type?: number;
    is_admin?: number;
  };
};

export type LiveEventEnvelope = {
  type: "bilibili" | "status" | "system" | "commentary";
  payload: unknown;
  timestamp: number;
};
