import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CANON_ROUTE, MELON_STORY } from "../src/story/melonStory";
import {
  chooseStoryOption,
  createStoryRuntime,
  validateStory,
} from "../src/story/storyEngine";
import { planPathToSafeDestination } from "../src/game/isometric";
import { MARKET_PROP_BLOCKERS } from "../src/game/sceneProps";
import {
  STORY_CHARACTERS,
  STORY_NPC_BLOCKERS,
} from "../src/story/melonStory";
import {
  getStagePlacement,
  horizontalFacing,
  isAdjacentTo,
} from "../src/story/stageLayout";

describe("三选项剧情图", () => {
  it("所有非演出、非结局节点都有且仅有 A/B/C 三个选项", () => {
    expect(validateStory()).toEqual([]);
    for (const node of Object.values(MELON_STORY)) {
      if (node.ending || node.autoAdvanceTo) continue;
      expect(node.choices.map((choice) => choice.id)).toEqual(["A", "B", "C"]);
      expect(new Set(node.choices.map((choice) => choice.next)).size).toBe(3);
    }
  });

  it("经典 A 路线覆盖问价、保熟、称重、吸铁石、开瓜、冲突和倒地", () => {
    let runtime = createStoryRuntime();
    for (const expectedNode of CANON_ROUTE.slice(1, 8)) {
      runtime = chooseStoryOption(runtime, "A");
      expect(runtime.nodeId).toBe(expectedNode);
    }
    expect(runtime.canonRouteActive).toBe(true);
    expect(CANON_ROUTE).toEqual(
      expect.arrayContaining([
        "ask_price",
        "guarantee",
        "weigh_melon",
        "reveal_magnet",
        "cut_melon",
        "vendor_confronts",
        "hao_fall_1",
        "hao_injured",
      ]),
    );
  });

  it("进入新节点后释放上一轮选项，允许下一轮投票继续倒计时", () => {
    const firstRoundSelected = {
      ...createStoryRuntime(),
      selectedChoice: "A" as const,
    };
    const secondRound = chooseStoryOption(firstRoundSelected, "A");

    expect(secondRound.nodeId).toBe("ask_price");
    expect(secondRound.selectedChoice).toBeNull();

    const secondRoundSelected = {
      ...secondRound,
      selectedChoice: "B" as const,
    };
    const thirdRound = chooseStoryOption(secondRoundSelected, "B");
    expect(thirdRound.selectedChoice).toBeNull();
  });

  it("郝哥倒地使用八帧透明 PNG 并保留受伤状态图", () => {
    const spriteDir = path.join(
      process.cwd(),
      "public",
      "assets",
      "generated",
      "sprites",
    );
    for (let index = 0; index < 8; index += 1) {
      expect(fs.existsSync(path.join(spriteDir, `hao_fall_${index}.png`))).toBe(
        true,
      );
    }
    expect(fs.existsSync(path.join(spriteDir, "hao_injured.png"))).toBe(true);
  });

  it("主舞台人物表已移除神经质旅客", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src", "game", "npcs.ts"),
      "utf8",
    );
    expect(source).not.toContain("神经质旅客");
    expect(source).not.toContain("VENDOR_ASSISTANT");
  });

  it("所有剧情目的地都能从南侧入口规划出不穿模路径", () => {
    const destinations = Object.values(MELON_STORY)
      .map((node) => node.stagePlacement?.destination)
      .filter((destination) => destination !== undefined);
    const blockers = new Set([
      ...MARKET_PROP_BLOCKERS,
      ...STORY_NPC_BLOCKERS,
    ]);
    for (const requested of destinations) {
      const plan = planPathToSafeDestination(
        { column: 4, row: 22 },
        requested,
        blockers,
      );
      expect(plan, `${requested.column},${requested.row}`).not.toBeNull();
      expect(
        plan!.path.every(
          (cell) =>
            !blockers.has(`${cell.column},${cell.row}`),
        ),
      ).toBe(true);
    }
  });

  it("郝哥对话使用相邻演出格，并让华强面朝郝哥", () => {
    const placement = getStagePlacement("ask_price");
    expect(placement).not.toBeNull();
    expect(
      isAdjacentTo(
        placement!.destination,
        STORY_CHARACTERS.HAO_GE!.initialPosition,
      ),
    ).toBe(true);
    expect(
      horizontalFacing(
        placement!.destination,
        placement!.faceTarget,
      ),
    ).toBe("left");
    const plan = planPathToSafeDestination(
      { column: 4, row: 22 },
      placement!.destination,
      MARKET_PROP_BLOCKERS,
    );
    expect(plan?.destination).toEqual(placement!.destination);
  });

  it("检查秤、切瓜和停摩托使用不同的专属演出锚点", () => {
    const scale = getStagePlacement("reveal_magnet")!.destination;
    const cutting = getStagePlacement("cut_melon")!.destination;
    const motorcycle = getStagePlacement("park_bike")!.destination;
    expect(new Set([
      `${scale.column},${scale.row}`,
      `${cutting.column},${cutting.row}`,
      `${motorcycle.column},${motorcycle.row}`,
    ]).size).toBe(3);
  });
});
