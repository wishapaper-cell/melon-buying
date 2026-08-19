import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCanonOption, getCanonFixedDialogue } from "../src/engine/canon";
import { resolveAction } from "../src/engine/actionResolver";
import { buildFallbackDialogue } from "../src/engine/dialogue/fallback";
import { validateDialogue } from "../src/engine/dialogue/validator";
import { buildFallbackOptions } from "../src/engine/options/fallback";
import { RuntimeOptionsArraySchema } from "../src/engine/options/schema";
import { validateRuntimeOptions } from "../src/engine/options/validator";
import { synthesizeFallbackE } from "../src/engine/proposals";
import { VoteSession } from "../src/engine/voting";
import {
  MELON_STREET_OBJECTS,
  OBJECTS_BY_ID,
} from "../src/game/catalog";
import { buildInteractionContext } from "../src/game/interactionContext";
import { NPCS_BY_ID } from "../src/game/npcs";
import {
  createInitialWorldState,
  type StorageLike,
  WorldStore,
} from "../src/game/worldStore";
import { composeVisualState } from "../src/game/visualState";
import type {
  DialogueGenerationContext,
  GeneratedDialogueTurn,
  LiveOption,
  Proposal,
  RuntimeOption,
} from "../src/shared/types";

class MemoryStorage implements StorageLike {
  private readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

const objectContext = (objectId = "hao_scale") =>
  buildInteractionContext(createInitialWorldState(), objectId, "OBJECT");

const npcContext = () =>
  buildInteractionContext(createInitialWorldState(), "HAO_GE", "NPC");

const asLive = (option: RuntimeOption): LiveOption => ({ ...option });

const dialogueContextFor = (
  option: LiveOption,
  result = resolveAction(option, createInitialWorldState()),
): DialogueGenerationContext => ({
  option,
  actionResult: result,
  objectState: result.nextObjectState ?? "DEFAULT",
  newFacts: result.revealedFacts,
    speakerIds: ["HUAQIANG", "HAO_GE", "NEIGHBOR", "ONLOOKER_01"],
  relationships: { HUAQIANG_TO_VENDOR: -10 },
  emotions: {
    HAO_GE: "CALM",
    NEIGHBOR: "CALM",
    ONLOOKER_01: "SUSPICIOUS",
  },
  goals: {
    HAO_GE: "卖瓜",
    NEIGHBOR: "避免麻烦",
    ONLOOKER_01: "看清真相",
  },
  recentDialogue: [],
  recentEvents: [],
  tension: 30,
  allowedFacts: result.revealedFacts,
  forbiddenFacts: ["scale_contains_magnet"],
  forbiddenFactLabels: { scale_contains_magnet: "秤里有吸铁石" },
});

describe("《华强买瓜：无限世界线》二十项验收", () => {
  it("01 所有正式场景物品都有唯一稳定ID和object.json", () => {
    const ids = MELON_STREET_OBJECTS.map((object) => object.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(22);
    for (const id of ids) {
      const jsonPath = path.join(
        process.cwd(),
        "public",
        "assets",
        "objects",
        id,
        "object.json",
      );
      expect(fs.existsSync(jsonPath), id).toBe(true);
      const manifest = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as {
        id: string;
      };
      expect(manifest.id).toBe(id);
    }
  });

  it("02 所有物品至少拥有DEFAULT、HOVER和FOCUSED", () => {
    for (const object of MELON_STREET_OBJECTS) {
      expect(object.availableVisualStates).toEqual(
        expect.arrayContaining(["DEFAULT", "HOVER", "FOCUSED"]),
      );
    }
  });

  it("03 物品状态和交互覆盖层会正确组合切换", () => {
    const object = OBJECTS_BY_ID.hao_scale!;
    const persisted = {
      baseVisualState: "MAGNET_REVEALED",
      facts: {},
      discovered: true,
      localMemory: [],
    };
    const hover = composeVisualState(object, persisted, "HOVER");
    const focused = composeVisualState(object, persisted, "FOCUSED");
    expect(hover.assetKey).toBe("scale_magnet_revealed");
    expect(hover.effects).toContain("pixel-outline");
    expect(focused.effects).toContain("scene-dim");
    expect(focused.baseState).toBe("MAGNET_REVEALED");
  });

  it("04 离开场景并重新创建Store后物品状态仍保持", () => {
    const storage = new MemoryStorage();
    const first = new WorldStore(storage);
    first.updateObjectState("hao_scale", "BROKEN", { calibrated: false });
    const second = new WorldStore(storage);
    expect(second.getSnapshot().objectStates.hao_scale?.baseVisualState).toBe(
      "BROKEN",
    );
  });

  it("04b 世界未变化时Store快照引用稳定，避免React重复订阅", () => {
    const store = new WorldStore(new MemoryStorage());
    expect(store.getSnapshot()).toBe(store.getSnapshot());
    const before = store.getSnapshot();
    store.updateObjectState("short_stool", "FALLEN");
    expect(store.getSnapshot()).not.toBe(before);
  });

  it("05 普通物品交互生成A、B、C、D", () => {
    const context = objectContext();
    const result = buildFallbackOptions(context);
    expect(result.options.map((item) => item.id)).toEqual(["A", "B", "C", "D"]);
    expect(validateRuntimeOptions(result.options, context).valid).toBe(true);
  });

  it("06 NPC交互生成A、B、C、D", () => {
    const context = npcContext();
    const result = buildFallbackOptions(context);
    expect(result.options).toHaveLength(4);
    expect(result.options.every((item) => item.targetNpcId === "HAO_GE")).toBe(
      true,
    );
    expect(validateRuntimeOptions(result.options, context).valid).toBe(true);
  });

  it("07 E选项可由弹幕提案实时归纳", () => {
    const proposals: Proposal[] = [
      {
        id: "1",
        messageId: "m1",
        viewerId: "u1",
        viewerName: "甲",
        text: "#提案 重新称一次",
        timestamp: 1,
      },
      {
        id: "2",
        messageId: "m2",
        viewerId: "u2",
        viewerName: "乙",
        text: "#提案 用砝码复验",
        timestamp: 2,
      },
    ];
    const option = synthesizeFallbackE(proposals, objectContext());
    expect(option.id).toBe("E");
    expect(option.actionType).toBe("WEIGH");
    expect(option.description).toContain("2条");
  });

  it("07b 不相关或高风险提案不会伪装成可执行E选项", () => {
    const proposals: Proposal[] = [
      {
        id: "unsafe",
        messageId: "unsafe-message",
        viewerId: "u3",
        viewerName: "丙",
        text: "#提案 骑摩托去打死人",
        timestamp: 3,
      },
    ];
    const option = synthesizeFallbackE(proposals, objectContext());
    expect(option.shortLabel).toBe("观察后再决定");
    expect(option.actionType).toBe("OBSERVE");
  });

  it("08 所有选项都引用当前真实对象或NPC", () => {
    const objectOptions = buildFallbackOptions(objectContext()).options;
    expect(
      objectOptions.every(
        (option) => !!option.targetObjectId && !!OBJECTS_BY_ID[option.targetObjectId],
      ),
    ).toBe(true);
    const npcOptions = buildFallbackOptions(npcContext()).options;
    expect(
      npcOptions.every(
        (option) => !!option.targetNpcId && !!NPCS_BY_ID[option.targetNpcId],
      ),
    ).toBe(true);
  });

  it("09 不可执行或引用假对象的选项会被校验器拒绝", () => {
    const context = objectContext();
    const options = structuredClone(buildFallbackOptions(context).options);
    options[1]!.targetObjectId = "invented_object";
    options[1]!.actionType = "RIDE";
    const validation = validateRuntimeOptions(options, context);
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(" ")).toMatch(/不可执行|当前物品/u);
  });

  it("10 非经典选项的后续对话来自状态模板而不是固定原文", () => {
    const context = objectContext();
    const option = asLive(buildFallbackOptions(context).options[1]);
    const turns = buildFallbackDialogue(dialogueContextFor(option));
    expect(turns[0]?.text).not.toContain("瓜皮子是金子");
    expect(turns.length).toBeGreaterThanOrEqual(1);
  });

  it("11 实时对话不会泄露角色未知事实", () => {
    const option = asLive(buildFallbackOptions(objectContext()).options[1]);
    const context = dialogueContextFor(option);
    const leaking: GeneratedDialogueTurn[] = [
      {
        speakerId: "HUAQIANG",
        text: "原来秤里有吸铁石。",
        emotion: "CONFIDENT",
        animationCue: "actor_talk",
        facePortraitState: "huaqiang_confident",
        conversationShouldContinue: false,
      },
    ];
    expect(validateDialogue(leaking, context).valid).toBe(false);
  });

  it("12 对话和行动都携带可播放动画提示", () => {
    const option = asLive(buildFallbackOptions(objectContext()).options[1]);
    const result = resolveAction(option, createInitialWorldState());
    const turns = buildFallbackDialogue(dialogueContextFor(option, result));
    expect(result.animationCue.length).toBeGreaterThan(0);
    expect(turns.every((turn) => turn.animationCue.length > 0)).toBe(true);
  });

  it("13 对话结束后可根据更新后的世界继续生成下一轮", () => {
    const storage = new MemoryStorage();
    const store = new WorldStore(storage);
    const before = buildInteractionContext(
      store.getSnapshot(),
      "hao_scale",
      "OBJECT",
    );
    const inspect = asLive(
      buildFallbackOptions(before).options.find(
        (item) => item.actionType === "INSPECT",
      )!,
    );
    store.applyActionResult(resolveAction(inspect, store.getSnapshot()));
    const after = buildInteractionContext(
      store.getSnapshot(),
      "hao_scale",
      "OBJECT",
    );
    expect(after.objectState).toBe("MAGNET_REVEALED");
    expect(buildFallbackOptions(after).options).toHaveLength(4);
  });

  it("14 经典路线A选项绑定固定原文", () => {
    const context = objectContext("price_sign");
    const canon = buildCanonOption(context);
    expect(canon?.id).toBe("A");
    expect(canon?.canonical).toBe(true);
    expect(getCanonFixedDialogue(canon!, context)?.[0]?.text).toContain(
      "瓜皮子是金子做的",
    );
  });

  it("15 经典固定台词逐字输出，不经过改写", () => {
    const context = objectContext("price_sign");
    const canon = buildCanonOption(context)!;
    expect(getCanonFixedDialogue(canon, context)?.[0]?.text).toBe(
      "What’s up，这瓜皮子是金子做的还是这瓜粒子是金子做的",
    );
  });

  it("16 选择B、C、D或E后经典路线会终止", () => {
    const store = new WorldStore(new MemoryStorage());
    expect(store.getSnapshot().canonRouteActive).toBe(true);
    store.markCanonDeviation();
    expect(store.getSnapshot().canonRouteActive).toBe(false);
    expect(store.getSnapshot().canonBeatId).toBeNull();
  });

  it("17 物品状态会改变下一轮选项能力和缓存上下文", () => {
    const defaultWorld = createInitialWorldState();
    const defaultContext = buildInteractionContext(
      defaultWorld,
      "hao_scale",
      "OBJECT",
    );
    defaultWorld.objectStates.hao_scale!.baseVisualState = "BROKEN";
    const brokenContext = buildInteractionContext(
      defaultWorld,
      "hao_scale",
      "OBJECT",
    );
    const defaultResult = buildFallbackOptions(defaultContext);
    const brokenResult = buildFallbackOptions(brokenContext);
    expect(defaultContext.supportedActions).toContain("WEIGH");
    expect(brokenContext.supportedActions).not.toContain("WEIGH");
    expect(brokenContext.supportedActions).toContain("REPAIR");
    expect(defaultResult.generationContextHash).not.toBe(
      brokenResult.generationContextHash,
    );
  });

  it("18 AI不可用时明确标记本地降级而非伪装实时结果", () => {
    const result = buildFallbackOptions(objectContext());
    expect(result.degraded).toBe(true);
    expect(result.notice).toContain("本地保底");
  });

  it("19 实时选项结果符合JSON Schema", () => {
    const result = RuntimeOptionsArraySchema.safeParse(
      buildFallbackOptions(objectContext()).options,
    );
    expect(result.success).toBe(true);
  });

  it("20 错误选项不会直接进入动作执行", () => {
    const world = createInitialWorldState();
    world.objectStates.hao_scale!.baseVisualState = "BROKEN";
    const invalid: LiveOption = {
      ...buildFallbackOptions(objectContext()).options[0],
      id: "E",
      actionType: "WEIGH",
      targetObjectId: "hao_scale",
      animationCue: "scale_bounce",
    };
    const result = resolveAction(invalid, world);
    expect(result.success).toBe(false);
    expect(result.nextObjectState).toBe("BROKEN");
  });
});

describe("直播投票补充规则", () => {
  it("同一观众只保留最后一票，重复msg_id不重复计数", () => {
    const context = objectContext();
    const base = buildFallbackOptions(context);
    const e = synthesizeFallbackE([], context);
    const options = [...base.options.map(asLive), e];
    const session = new VoteSession(base.interactionId, options);
    expect(session.cast("u1", "A", "m1")).toBe(true);
    expect(session.cast("u1", "B", "m2")).toBe(true);
    expect(session.cast("u2", "B", "m2")).toBe(false);
    expect(session.counts()).toEqual({ A: 0, B: 1, C: 0, D: 0, E: 0 });
  });
});
