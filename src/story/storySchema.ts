import { z } from "zod";
import {
  GRID_COLUMNS,
  GRID_ROWS,
  type GridPosition,
} from "../game/isometric";
import type {
  StoryCharacterDefinition,
  StoryDocument,
  StoryNode,
} from "./types";

const PositionSchema = z.object({
  column: z.number().int().min(0),
  row: z.number().int().min(0),
});

const ExpressionSchema = z.object({
  pose: z.string().min(1),
  animation: z.string().min(1),
  sprites: z
    .union([
      z.string().min(1),
      z.object({
        left: z.string().min(1),
        right: z.string().min(1),
      }),
    ])
    .optional(),
  portrait: z.string().min(1).optional(),
  mouth: z
    .object({
      left: z.object({
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
      }),
      right: z.object({
        x: z.number().min(0).max(100),
        y: z.number().min(0).max(100),
      }),
      width: z.number().int().min(1).max(12),
      height: z.number().int().min(1).max(8),
      color: z.string().min(1),
      openColor: z.string().min(1).optional(),
      intervalMs: z.number().int().min(80).max(1000),
    })
    .optional(),
});

const CharacterSchema = z.object({
  displayName: z.string().min(1),
  initialPosition: PositionSchema,
  defaultExpression: z.string().min(1),
  expressions: z.record(z.string().min(1), ExpressionSchema),
});

const FaceSchema = z.union([
  z.object({ character: z.string().min(1) }),
  z.object({ position: PositionSchema }),
]);

const StageCharacterSchema = z.object({
  expression: z.string().min(1),
  position: PositionSchema.optional(),
});

const SequenceCharacterSchema = z.object({
  position: PositionSchema.optional(),
  expression: z.string().min(1).optional(),
  facing: z.enum(["left", "right"]).optional(),
  motion: z
    .enum(["idle", "walk", "reach", "lift", "hold", "pat", "present"])
    .optional(),
  spriteSheet: z
    .object({
      asset: z.string().min(1),
      columns: z.number().int().min(1).max(32),
      rows: z.number().int().min(1).max(32).default(1),
      frame: z.number().int().min(0),
    })
    .nullable()
    .optional(),
});

const SequenceBeatSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  durationMs: z.number().int().min(80).max(10_000),
  bubble: z.boolean().optional(),
  characters: z.record(z.string().min(1), SequenceCharacterSchema).default({}),
  props: z
    .record(
      z.string().min(1),
      z.object({
        state: z.string().min(1),
        position: PositionSchema.optional(),
      }),
    )
    .default({}),
});

const ChoiceSchema = z.object({
  id: z.enum(["A", "B", "C"]),
  label: z.string().min(1),
  description: z.string().min(1),
  next: z.string().min(1),
  canonical: z.boolean(),
  tensionDelta: z.number().int().min(-100).max(100),
  sanDelta: z.number().int().min(-100).max(100).optional(),
});

const JsonNodeSchema = z.object({
  id: z.string().min(1),
  chapter: z.string().min(1),
  speaker: z.string().min(1),
  narration: z.string().min(1),
  dialogue: z.string().min(1).optional(),
  stageDirection: z.string().min(1),
  stage: z.object({
    playerPlacement: z
      .object({
        at: PositionSchema,
        face: FaceSchema.optional(),
      })
      .optional(),
    characters: z.record(z.string().min(1), StageCharacterSchema),
    sequence: z
      .object({
        beats: z.array(SequenceBeatSchema).min(1).max(64),
      })
      .optional(),
    bubble: z
      .object({
        visible: z.boolean().default(true),
        maxWidth: z.number().int().min(120).max(480).default(260),
        offsetY: z.number().int().min(0).max(200).default(18),
      })
      .optional(),
  }),
  choices: z.array(ChoiceSchema),
  autoAdvance: z
    .object({
      next: z.string().min(1),
      delayMs: z.number().int().min(50).max(120_000),
    })
    .optional(),
  ending: z.enum(["CANON", "DETOUR", "PEACEFUL"]).optional(),
});

export const StoryJsonSchema = z.object({
  $schema: z.string().optional(),
  formatVersion: z.literal(1),
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional(),
  entryNodeId: z.string().min(1),
  canonRoute: z.array(z.string().min(1)),
  characters: z.record(z.string().min(1), CharacterSchema),
  nodes: z.array(JsonNodeSchema).min(1),
});

const insideMap = ({ column, row }: GridPosition) =>
  column < GRID_COLUMNS && row < GRID_ROWS;

export const loadStoryDocument = (raw: unknown): StoryDocument => {
  const parsed = StoryJsonSchema.parse(raw);
  const errors: string[] = [];
  const nodeIds = new Set<string>();

  for (const [characterId, character] of Object.entries(parsed.characters)) {
    if (!insideMap(character.initialPosition)) {
      errors.push(`角色 ${characterId} 的初始站位超出地图`);
    }
    if (!character.expressions[character.defaultExpression]) {
      errors.push(
        `角色 ${characterId} 的默认表情 ${character.defaultExpression} 未定义`,
      );
    }
  }

  for (const node of parsed.nodes) {
    if (nodeIds.has(node.id)) errors.push(`剧情节点 ID 重复：${node.id}`);
    nodeIds.add(node.id);
  }

  const resolveFaceTarget = (
    face: z.infer<typeof FaceSchema> | undefined,
  ): GridPosition | undefined => {
    if (!face) return undefined;
    if ("position" in face) return face.position;
    return parsed.characters[face.character]?.initialPosition;
  };

  const nodes: StoryNode[] = parsed.nodes.map((node) => {
    const speaker = parsed.characters[node.speaker];
    if (!speaker) errors.push(`${node.id} 引用了未定义说话人 ${node.speaker}`);
    if (node.choices.length !== 0 && node.choices.length !== 3) {
      errors.push(`${node.id} 必须有 0 或 3 个选项`);
    }
    if (node.choices.length === 3) {
      const ids = node.choices.map((choice) => choice.id).join("");
      if (ids !== "ABC") errors.push(`${node.id} 的选项必须按 A/B/C 排列`);
    }
    if (node.stage.playerPlacement) {
      if (!insideMap(node.stage.playerPlacement.at)) {
        errors.push(`${node.id} 的玩家站位超出地图`);
      }
      const target = resolveFaceTarget(node.stage.playerPlacement.face);
      if (node.stage.playerPlacement.face && !target) {
        errors.push(`${node.id} 的面向目标角色不存在`);
      }
    }

    const expressions: Record<string, string> = {};
    const pose: Record<string, string> = {};
    const characterPositions: Record<string, GridPosition> = {};
    for (const [characterId, state] of Object.entries(node.stage.characters)) {
      const character = parsed.characters[characterId];
      if (!character) {
        errors.push(`${node.id} 的舞台角色 ${characterId} 未定义`);
        continue;
      }
      const definition = character.expressions[state.expression];
      if (!definition) {
        errors.push(
          `${node.id} 使用了 ${characterId} 未定义的表情 ${state.expression}`,
        );
        continue;
      }
      expressions[characterId] = state.expression;
      pose[characterId] = definition.pose;
      if (state.position) {
        if (!insideMap(state.position)) {
          errors.push(`${node.id} 的 ${characterId} 站位超出地图`);
        }
        characterPositions[characterId] = state.position;
      }
    }
    if (node.stage.sequence) {
      const beatIds = new Set<string>();
      const hasDialogueBeat = node.stage.sequence.beats.some(
        (beat) => beat.bubble === true,
      );
      if (node.dialogue && !hasDialogueBeat) {
        errors.push(`${node.id} 有人物台词，但分镜中没有显示气泡的节拍`);
      }
      if (!node.dialogue && hasDialogueBeat) {
        errors.push(`${node.id} 没有人物台词，分镜不应显示气泡`);
      }
      for (const beat of node.stage.sequence.beats) {
        if (beatIds.has(beat.id)) {
          errors.push(`${node.id} 的分镜节拍 ID 重复：${beat.id}`);
        }
        beatIds.add(beat.id);
        for (const [characterId, state] of Object.entries(beat.characters)) {
          const character = parsed.characters[characterId];
          if (!character) {
            errors.push(
              `${node.id}.${beat.id} 引用了未定义角色 ${characterId}`,
            );
            continue;
          }
          if (state.position && !insideMap(state.position)) {
            errors.push(`${node.id}.${beat.id} 的 ${characterId} 站位超出地图`);
          }
          if (state.expression && !character.expressions[state.expression]) {
            errors.push(
              `${node.id}.${beat.id} 使用了 ${characterId} 未定义的表情 ${state.expression}`,
            );
          }
          if (
            state.spriteSheet &&
            state.spriteSheet.frame >=
              state.spriteSheet.columns * state.spriteSheet.rows
          ) {
            errors.push(
              `${node.id}.${beat.id} 的精灵帧 ${state.spriteSheet.frame} 超出图集范围`,
            );
          }
        }
        for (const [propId, state] of Object.entries(beat.props)) {
          if (state.position && !insideMap(state.position)) {
            errors.push(`${node.id}.${beat.id} 的道具 ${propId} 位置超出地图`);
          }
        }
      }
    }

    return {
      id: node.id,
      chapter: node.chapter,
      speaker: node.speaker,
      speakerName: speaker?.displayName ?? node.speaker,
      narration: node.narration,
      ...(node.dialogue ? { dialogue: node.dialogue } : {}),
      stageDirection: node.stageDirection,
      pose,
      expressions,
      characterPositions,
      speechBubble: {
        visible: node.stage.bubble?.visible ?? true,
        maxWidth: node.stage.bubble?.maxWidth ?? 260,
        offsetY: node.stage.bubble?.offsetY ?? 18,
      },
      ...(node.stage.sequence ? { sequence: node.stage.sequence } : {}),
      ...(node.stage.playerPlacement
        ? {
            stagePlacement: {
              destination: node.stage.playerPlacement.at,
              faceTarget: resolveFaceTarget(node.stage.playerPlacement.face),
            },
          }
        : {}),
      choices: node.choices as unknown as StoryNode["choices"],
      ...(node.autoAdvance
        ? {
            autoAdvanceTo: node.autoAdvance.next,
            autoAdvanceMs: node.autoAdvance.delayMs,
          }
        : {}),
      ...(node.ending ? { ending: node.ending } : {}),
    };
  });

  for (const node of parsed.nodes) {
    for (const choice of node.choices) {
      if (!nodeIds.has(choice.next)) {
        errors.push(`${node.id}.${choice.id} 指向不存在的节点 ${choice.next}`);
      }
    }
    if (node.autoAdvance && !nodeIds.has(node.autoAdvance.next)) {
      errors.push(`${node.id} 自动跳转到不存在的节点`);
    }
  }
  if (!nodeIds.has(parsed.entryNodeId)) {
    errors.push(`入口节点不存在：${parsed.entryNodeId}`);
  }
  for (const nodeId of parsed.canonRoute) {
    if (!nodeIds.has(nodeId)) errors.push(`经典路线节点不存在：${nodeId}`);
  }
  if (errors.length > 0) {
    throw new Error(`剧情 JSON 校验失败：\n- ${errors.join("\n- ")}`);
  }

  return {
    formatVersion: 1,
    id: parsed.id,
    title: parsed.title,
    description: parsed.description,
    entryNodeId: parsed.entryNodeId,
    canonRoute: [...parsed.canonRoute],
    characters: parsed.characters as Record<
      string,
      StoryCharacterDefinition
    >,
    nodes,
  };
};
