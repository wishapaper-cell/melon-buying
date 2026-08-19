import type {
  DirectorBeat,
  DirectorCommand,
  DirectorPlan,
} from "./director";
import type { GridPosition } from "../game/isometric";

export type DirectorPresentation = {
  active: boolean;
  beatLabel?: string;
  actorPositions: Partial<Record<string, GridPosition>>;
  actorExpressions: Partial<Record<string, string>>;
  actorFacings: Partial<Record<string, "left" | "right">>;
  actorMoving: Partial<Record<string, boolean>>;
  speech?: {
    actorId: string;
    text: string;
  };
};

export const EMPTY_DIRECTOR_PRESENTATION: DirectorPresentation = {
  active: false,
  actorPositions: {},
  actorExpressions: {},
  actorFacings: {},
  actorMoving: {},
};

export type DirectorExecutionFailure = {
  ok: false;
  beatId?: string;
  command?: DirectorCommand;
  reason: string;
};

export type DirectorExecutionResult =
  | { ok: true }
  | DirectorExecutionFailure;

export type DirectorExecutionBindings = {
  moveTo: (
    command: Extract<DirectorCommand, { command: "MOVE_TO" }>,
  ) => Promise<boolean>;
  face: (
    command: Extract<DirectorCommand, { command: "FACE" }>,
  ) => Promise<boolean> | boolean;
  emote: (
    command: Extract<DirectorCommand, { command: "EMOTE" }>,
  ) => Promise<boolean> | boolean;
  speak: (
    command: Extract<DirectorCommand, { command: "SPEAK" }>,
  ) => Promise<boolean>;
  interact: (
    command: Extract<DirectorCommand, { command: "INTERACT" }>,
  ) => Promise<boolean> | boolean;
  wait: (durationMs: number) => Promise<void>;
  onBeatStart?: (beat: DirectorBeat) => void;
  applyBeatDeltas: (beat: DirectorBeat) => void;
};

export class DirectorLockTable {
  private readonly owners = new Map<string, string>();

  acquire(planId: string, resources: readonly string[]): boolean {
    if (
      resources.some((resource) => {
        const owner = this.owners.get(resource);
        return owner !== undefined && owner !== planId;
      })
    ) {
      return false;
    }
    resources.forEach((resource) => this.owners.set(resource, planId));
    return true;
  }

  release(planId: string): void {
    for (const [resource, owner] of this.owners) {
      if (owner === planId) this.owners.delete(resource);
    }
  }

  clear(): void {
    this.owners.clear();
  }
}

const executeCommand = async (
  command: DirectorCommand,
  bindings: DirectorExecutionBindings,
): Promise<boolean> => {
  if (command.command === "MOVE_TO") {
    return bindings.moveTo(command);
  }
  if (command.command === "FACE") {
    return bindings.face(command);
  }
  if (command.command === "EMOTE") {
    return bindings.emote(command);
  }
  if (command.command === "SPEAK") {
    return bindings.speak(command);
  }
  if (command.command === "INTERACT") {
    return bindings.interact(command);
  }
  await bindings.wait(Math.max(0, Math.min(8_000, command.durationMs)));
  return true;
};

export const runDirectorPlan = async (
  plan: DirectorPlan,
  bindings: DirectorExecutionBindings,
  signal?: AbortSignal,
): Promise<DirectorExecutionResult> => {
  for (const beat of plan.beats) {
    bindings.onBeatStart?.(beat);
    for (const command of beat.commands) {
      if (signal?.aborted) {
        return { ok: false, beatId: beat.id, command, reason: "导演计划已取消" };
      }
      try {
        const completed = await executeCommand(command, bindings);
        if (!completed) {
          return {
            ok: false,
            beatId: beat.id,
            command,
            reason: `${command.command} 未能完成`,
          };
        }
      } catch (error) {
        return {
          ok: false,
          beatId: beat.id,
          command,
          reason: error instanceof Error ? error.message : "导演命令执行失败",
        };
      }
    }
    bindings.applyBeatDeltas(beat);
  }
  return { ok: true };
};
