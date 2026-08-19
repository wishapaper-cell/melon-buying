import type { GridPosition } from "../game/isometric";
import { STORY_CHARACTERS, getStoryExpression } from "./melonStory";
import type {
  StoryChoice,
  StoryChoiceId,
  StoryNode,
  StoryRuntime,
} from "./types";

export type AudienceProposal = {
  viewerId: string;
  text: string;
};

const safeSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_]+/gu, "_").slice(-36);

export const createAgentTargetId = (
  sourceNodeId: string,
  revision: number,
  choiceId: StoryChoiceId,
): string =>
  `agent_${safeSegment(sourceNodeId)}_${revision}_${choiceId.toLowerCase()}`;

const trimText = (
  value: unknown,
  fallback: string,
  maxLength: number,
): string => {
  const text = typeof value === "string" ? value.trim() : "";
  return (text || fallback).slice(0, maxLength);
};

const numberWithin = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? Math.max(minimum, Math.min(maximum, Math.round(numeric)))
    : fallback;
};

export const createProvisionalAudienceChoice = (
  sourceNodeId: string,
  revision: number,
  choiceId: StoryChoiceId,
  text: string,
): StoryChoice => ({
  id: choiceId,
  label: trimText(text, "听弹幕的", 18),
  description: trimText(`观众提议：${text}`, "按观众提议行动。", 54),
  next: createAgentTargetId(sourceNodeId, revision, choiceId),
  canonical: false,
  tensionDelta: 0,
  sanDelta: 0,
});

export const normalizeAgentChoice = (
  raw: Partial<StoryChoice> | undefined,
  id: StoryChoiceId,
  next: string,
  fallbackLabel: string,
): StoryChoice => ({
  id,
  label: trimText(raw?.label, fallbackLabel, 18),
  description: trimText(
    raw?.description,
    "局势将沿着这条世界线继续。",
    54,
  ),
  next,
  canonical: false,
  tensionDelta: numberWithin(raw?.tensionDelta, 0, -20, 20),
  sanDelta: numberWithin(raw?.sanDelta, 0, -15, 15),
});

const normalizePosition = (
  raw: unknown,
  fallback: GridPosition,
): GridPosition => {
  const position = raw as Partial<GridPosition> | undefined;
  return {
    column: numberWithin(position?.column, fallback.column, 1, 30),
    row: numberWithin(position?.row, fallback.row, 1, 22),
  };
};

export const createFallbackAgentNode = (
  targetNodeId: string,
  currentNode: StoryNode,
  choice: StoryChoice,
): StoryNode => {
  const positions = currentNode.characterPositions;
  const huaqiangPosition =
    positions.HUAQIANG ?? STORY_CHARACTERS.HUAQIANG!.initialPosition;
  return {
    id: targetNodeId,
    chapter: "观众共创世界线",
    speaker: "HUAQIANG",
    speakerName: "华强",
    narration: `弹幕选择了“${choice.label}”，街口的局势继续变化。`,
    dialogue: `行，就照“${choice.label}”试试。`,
    stageDirection: "华强观察周围，准备执行观众选出的行动。",
    pose: { HUAQIANG: getStoryExpression("HUAQIANG", "talk")?.pose ?? "idle" },
    expressions: { HUAQIANG: "talk", HAO_GE: "watch" },
    characterPositions: positions,
    stagePlacement: {
      destination: huaqiangPosition,
      faceTarget: positions.HAO_GE,
    },
    speechBubble: { visible: true, maxWidth: 260, offsetY: 16 },
    choices: [],
  };
};

export const normalizeAgentNode = (
  raw: Partial<StoryNode> | undefined,
  targetNodeId: string,
  currentNode: StoryNode,
  choice: StoryChoice,
): StoryNode => {
  const fallback = createFallbackAgentNode(
    targetNodeId,
    currentNode,
    choice,
  );
  const rawPositions = raw?.characterPositions ?? {};
  const characterPositions = Object.fromEntries(
    Object.keys(STORY_CHARACTERS).map((characterId) => [
      characterId,
      normalizePosition(
        rawPositions[characterId],
        currentNode.characterPositions[characterId] ??
          STORY_CHARACTERS[characterId]!.initialPosition,
      ),
    ]),
  );
  const expressions = Object.fromEntries(
    Object.entries(STORY_CHARACTERS).map(([characterId, character]) => {
      const requested = raw?.expressions?.[characterId];
      return [
        characterId,
        requested && character.expressions[requested]
          ? requested
          : character.defaultExpression,
      ];
    }),
  );
  const pose = Object.fromEntries(
    Object.entries(expressions).map(([characterId, expression]) => [
      characterId,
      getStoryExpression(characterId, expression)?.pose ?? "idle",
    ]),
  );
  const destinationFallback =
    characterPositions.HUAQIANG ??
    STORY_CHARACTERS.HUAQIANG!.initialPosition;

  return {
    ...fallback,
    chapter: trimText(raw?.chapter, fallback.chapter, 24),
    speaker:
      typeof raw?.speaker === "string" && STORY_CHARACTERS[raw.speaker]
        ? raw.speaker
        : fallback.speaker,
    speakerName: trimText(raw?.speakerName, fallback.speakerName, 12),
    narration: trimText(raw?.narration, fallback.narration, 90),
    dialogue: trimText(raw?.dialogue, fallback.dialogue ?? "", 48),
    stageDirection: trimText(
      raw?.stageDirection,
      fallback.stageDirection,
      70,
    ),
    pose,
    expressions,
    characterPositions,
    stagePlacement: {
      destination: normalizePosition(
        raw?.stagePlacement?.destination,
        destinationFallback,
      ),
      faceTarget: raw?.stagePlacement?.faceTarget
        ? normalizePosition(
            raw.stagePlacement.faceTarget,
            characterPositions.HAO_GE ?? destinationFallback,
          )
        : characterPositions.HAO_GE,
    },
    speechBubble: {
      visible: Boolean(raw?.dialogue),
      maxWidth: numberWithin(
        raw?.speechBubble?.maxWidth,
        fallback.speechBubble.maxWidth,
        180,
        360,
      ),
      offsetY: numberWithin(
        raw?.speechBubble?.offsetY,
        fallback.speechBubble.offsetY,
        -40,
        80,
      ),
    },
    choices: [],
    autoAdvanceTo: undefined,
    autoAdvanceMs: undefined,
    ending: undefined,
  };
};

export const buildAgentStoryContext = (
  runtime: StoryRuntime,
  node: StoryNode,
  resolveNode?: (nodeId: string) => StoryNode | undefined,
) => ({
  nodeId: node.id,
  currentNode: {
    chapter: node.chapter,
    narration: node.narration,
    dialogue: node.dialogue,
    stageDirection: node.stageDirection,
    expressions: node.expressions,
    characterPositions: node.characterPositions,
  },
  recentRoute: runtime.route.slice(-8),
  recentStory: runtime.route.slice(-6).flatMap((nodeId) => {
    const recentNode = resolveNode?.(nodeId);
    return recentNode
      ? [
          {
            nodeId: recentNode.id,
            narration: recentNode.narration,
            dialogue: recentNode.dialogue ?? "",
            stageDirection: recentNode.stageDirection,
            choiceLabels: recentNode.choices.map((choice) => choice.label),
          },
        ]
      : [];
  }),
  tension: runtime.tension,
  san: runtime.san,
  canonRouteActive: runtime.canonRouteActive,
  allowedActorIds: Object.keys(STORY_CHARACTERS),
  allowedExpressions: Object.fromEntries(
    Object.entries(STORY_CHARACTERS).map(([id, character]) => [
      id,
      Object.keys(character.expressions),
    ]),
  ),
});
