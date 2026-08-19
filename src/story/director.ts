import type { GridPosition } from "../game/isometric";
import {
  applyInstantInteraction,
  type InstantInteraction,
  type ObjectRuntime,
} from "../game/objectRuntime";

export type DirectorCommand =
  | {
      command: "MOVE_TO";
      actorId: string;
      destination: GridPosition | "nearest_interaction_cell";
      targetId?: string;
      faceTarget?: boolean;
    }
  | {
      command: "FACE";
      actorId: string;
      targetId: string;
    }
  | {
      command: "EMOTE";
      actorId: string;
      expression: string;
    }
  | {
      command: "SPEAK";
      actorId: string;
      text: string;
      expression?: string;
    }
  | {
      command: "INTERACT";
      actorId: string;
      targetId: string;
      interaction: InstantInteraction;
    }
  | {
      command: "WAIT";
      durationMs: number;
    };

export type DirectorBeat = {
  id: string;
  label: string;
  commands: DirectorCommand[];
  sanDelta?: number;
  tensionDelta?: number;
};

export type DirectorPlan = {
  planId: string;
  nodeId: string;
  winningChoiceId: "A" | "B" | "C";
  basedOnWorldRevision: number;
  requiredLocks: string[];
  beats: DirectorBeat[];
  fallbackNodeId: string;
};

export type DirectorWorldSnapshot = {
  revision: number;
  actorPositions: Record<string, GridPosition>;
  objects: Record<string, ObjectRuntime>;
  allowedActorIds: string[];
  allowedObjectIds: string[];
  allowedExpressions: Record<string, string[]>;
};

export type DirectorGateResult =
  | { ok: true }
  | { ok: false; reason: string };

const manhattanDistance = (left: GridPosition, right: GridPosition) =>
  Math.abs(left.column - right.column) + Math.abs(left.row - right.row);

/**
 * Agent 只能提交意图。这里是运行时门禁：防止陈旧计划、越权角色、
 * 未登记物品和远距离瞬移。
 */
export const gateDirectorPlan = (
  plan: DirectorPlan,
  snapshot: DirectorWorldSnapshot,
): DirectorGateResult => {
  if (!plan.planId || typeof plan.planId !== "string") {
    return { ok: false, reason: "导演计划缺少有效 ID" };
  }
  if (plan.basedOnWorldRevision !== snapshot.revision) {
    return { ok: false, reason: "世界状态已经变化，需要重新生成导演计划" };
  }
  const allowedResources = new Set([
    ...snapshot.allowedActorIds,
    ...snapshot.allowedObjectIds,
  ]);
  if (
    !Array.isArray(plan.requiredLocks) ||
    plan.requiredLocks.some((resource) => !allowedResources.has(resource))
  ) {
    return { ok: false, reason: "导演计划申请了未授权资源锁" };
  }
  const approachedTargets = new Set<string>();
  const lockedResources = new Set(plan.requiredLocks);
  for (const beat of plan.beats) {
    for (const command of beat.commands) {
      if (
        "actorId" in command &&
        !snapshot.allowedActorIds.includes(command.actorId)
      ) {
        return { ok: false, reason: `未授权人物：${command.actorId}` };
      }
      if (
        "actorId" in command &&
        !lockedResources.has(command.actorId)
      ) {
        return { ok: false, reason: "导演计划没有锁定执行人物" };
      }
      if (
        "targetId" in command &&
        command.targetId &&
        !lockedResources.has(command.targetId)
      ) {
        return { ok: false, reason: "导演计划没有锁定指令目标" };
      }
      if (command.command === "EMOTE") {
        if (
          !snapshot.allowedExpressions[command.actorId]?.includes(
            command.expression,
          )
        ) {
          return { ok: false, reason: "Agent 使用了未登记表情" };
        }
      }
      if (
        command.command === "MOVE_TO" &&
        command.targetId &&
        command.destination === "nearest_interaction_cell"
      ) {
        approachedTargets.add(`${command.actorId}:${command.targetId}`);
      }
      if (command.command === "INTERACT") {
        if (!snapshot.allowedObjectIds.includes(command.targetId)) {
          return { ok: false, reason: `未授权物品：${command.targetId}` };
        }
        if (command.interaction.actorId !== command.actorId) {
          return { ok: false, reason: "交互执行者与导演人物不一致" };
        }
        if (
          !snapshot.allowedObjectIds.includes(
            command.interaction.objectId,
          )
        ) {
          return {
            ok: false,
            reason: `未授权交互物品：${command.interaction.objectId}`,
          };
        }
        if (!lockedResources.has(command.interaction.objectId)) {
          return { ok: false, reason: "导演计划没有锁定交互物品" };
        }
        if (
          "targetId" in command.interaction &&
          !snapshot.allowedObjectIds.includes(
            command.interaction.targetId,
          )
        ) {
          return {
            ok: false,
            reason: `未授权承载物：${command.interaction.targetId}`,
          };
        }
        if (
          "targetId" in command.interaction &&
          !lockedResources.has(command.interaction.targetId)
        ) {
          return { ok: false, reason: "导演计划没有锁定承载物" };
        }
        const actor = snapshot.actorPositions[command.actorId];
        const object = snapshot.objects[command.targetId];
        const targetPosition = object?.anchor.gridPosition;
        if (
          actor &&
          targetPosition &&
          manhattanDistance(actor, targetPosition) > 1 &&
          !approachedTargets.has(
            `${command.actorId}:${command.targetId}`,
          )
        ) {
          return { ok: false, reason: "人物尚未到达物品交互距离" };
        }
      }
      if (command.command === "SPEAK" && command.text.length > 40) {
        return { ok: false, reason: "人物单句对白不能超过 40 字" };
      }
    }
  }
  return { ok: true };
};

export const executeDirectorInteraction = (
  command: Extract<DirectorCommand, { command: "INTERACT" }>,
  objects: Record<string, ObjectRuntime>,
) => applyInstantInteraction(objects, command.interaction);
