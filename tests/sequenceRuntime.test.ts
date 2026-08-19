import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MELON_STORY } from "../src/story/melonStory";
import {
  sequenceDuration,
  sequenceSnapshot,
} from "../src/story/sequenceRuntime";

describe("JSON 动作分镜运行时", () => {
  it("按节拍累积角色、精灵帧、道具和气泡状态", () => {
    const sequence = MELON_STORY.pick_melon?.sequence;
    expect(sequence?.beats).toHaveLength(9);
    expect(sequenceDuration(sequence)).toBe(3800);

    const approach = sequenceSnapshot(sequence, 0);
    expect(approach.activeBeat?.id).toBe("approach_pile");
    expect(approach.characters.HAO_GE?.motion).toBe("walk");
    expect(approach.bubble).toBe(false);
    expect(approach.props.melon_pile).toBeUndefined();

    const lifted = sequenceSnapshot(sequence, 2);
    expect(lifted.activeBeat?.id).toBe("lift_melon");
    expect(lifted.characters.HAO_GE?.spriteSheet?.frame).toBe(1);
    expect(lifted.props.melon_pile?.state).toBe("one-missing");

    const completed = sequenceSnapshot(sequence, sequence!.beats.length);
    expect(completed.complete).toBe(true);
    expect(completed.bubble).toBe(true);
    expect(completed.characters.HAO_GE?.motion).toBe("hold");
    expect(completed.characters.HAO_GE?.spriteSheet?.frame).toBe(3);
  });

  it("关键事件已配置动作，人物台词只在动作后出现", () => {
    for (const nodeId of [
      "ask_price",
      "pick_melon",
      "weigh_melon",
      "reveal_magnet",
      "cut_melon",
    ]) {
      const node = MELON_STORY[nodeId]!;
      expect(node.sequence?.beats.length).toBeGreaterThan(1);
      expect(node.sequence?.beats[0]?.bubble).toBe(false);
      expect(node.sequence?.beats.some((beat) => beat.bubble === true)).toBe(
        true,
      );
      expect(node.dialogue).toBeTruthy();
    }
  });

  it("称重时西瓜由郝哥搬运，松手前独立道具保持隐藏", () => {
    const sequence = MELON_STORY.weigh_melon?.sequence;
    expect(sequence?.beats.map((beat) => beat.id)).toEqual([
      "carry_melon_to_scale",
      "lower_melon_to_scale",
      "release_melon_on_scale",
      "scale_settles",
      "announce_weight",
    ]);

    const carrying = sequenceSnapshot(sequence, 0);
    expect(carrying.props.single_melon?.state).toBe("hidden");
    expect(carrying.characters.HAO_GE?.spriteSheet?.frame).toBe(2);
    expect(carrying.characters.HAO_GE?.motion).toBe("walk");

    const lowering = sequenceSnapshot(sequence, 1);
    expect(lowering.props.single_melon?.state).toBe("hidden");
    expect(lowering.characters.HAO_GE?.spriteSheet?.frame).toBe(3);

    const released = sequenceSnapshot(sequence, 2);
    expect(released.characters.HAO_GE?.spriteSheet).toBeNull();
    expect(released.props.single_melon).toEqual({
      state: "on-scale",
      position: { column: 18, row: 14 },
    });
  });

  it("对话不再让整个人物或嘴型播放动画", () => {
    const css = fs.readFileSync(
      path.join(process.cwd(), "src", "theme.css"),
      "utf8",
    );
    expect(css).not.toContain(".animation-talk img");
    expect(css).not.toContain(".talking-mouth");
    expect(css).not.toContain("@keyframes mouth-open");
  });

  it("人物使用统一站立尺寸，并单独校正异常素材的透明留白", () => {
    const scene = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "MarketScene.tsx"),
      "utf8",
    );
    const css = fs.readFileSync(
      path.join(process.cwd(), "src", "theme.css"),
      "utf8",
    );
    expect(css).toContain("width: 94px");
    expect(css).toContain("height: 141px");
    expect(css).toContain("--sprite-visual-scale: 1.225");
    expect(scene).toContain("hao_pick_melon_sheet.png");
    expect(scene).toContain("1.25");
  });
});
