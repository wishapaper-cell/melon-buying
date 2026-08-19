import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import storyJson from "../content/stories/melon-story.json";
import {
  MELON_STORY,
  STORY_CHARACTERS,
  STORY_DOCUMENT,
  getStoryExpression,
} from "../src/story/melonStory";
import { loadStoryDocument } from "../src/story/storySchema";

describe("JSON 剧情协作系统", () => {
  it("主剧情完全来自 JSON，并生成节点索引", () => {
    expect(STORY_DOCUMENT.id).toBe("huaqiang-melon-story");
    expect(STORY_DOCUMENT.nodes).toHaveLength(storyJson.nodes.length);
    expect(Object.keys(MELON_STORY)).toHaveLength(storyJson.nodes.length);
    expect(Object.keys(STORY_CHARACTERS)).toEqual(
      expect.arrayContaining(["HUAQIANG", "HAO_GE", "NEIGHBOR"]),
    );
  });

  it("JSON 可定义站位、面向角色、表情和动画", () => {
    const askPrice = MELON_STORY.ask_price!;
    expect(askPrice.stagePlacement).toEqual({
      destination: { column: 20, row: 15 },
      faceTarget: STORY_CHARACTERS.HAO_GE!.initialPosition,
    });
    expect(askPrice.expressions.HAO_GE).toBe("talk");
    expect(getStoryExpression("HAO_GE", "talk")?.animation).toBe("talk");
    expect(getStoryExpression("HAO_GE", "talk")?.mouth).toMatchObject({
      width: 4,
      intervalMs: 170,
    });
    expect(askPrice.speechBubble).toEqual({
      visible: true,
      maxWidth: 260,
      offsetY: 18,
    });
    expect(getStoryExpression("HAO_GE", "threaten")?.sprites).toBe(
      "/assets/generated/sprites/hao_angry.png",
    );
    expect(askPrice.narration).toContain("来到摊前");
    expect(askPrice.dialogue).toBe("两块钱一斤。反季瓜，进价就高。");
    expect(MELON_STORY.arrival?.dialogue).toBeUndefined();
  });

  it("未定义表情、重复节点和断链会阻止加载", () => {
    const badExpression = structuredClone(storyJson);
    badExpression.nodes[0]!.stage.characters.HAO_GE = {
      expression: "not_defined",
    };
    expect(() => loadStoryDocument(badExpression)).toThrow(/未定义的表情/u);

    const duplicate = structuredClone(storyJson);
    duplicate.nodes[1]!.id = duplicate.nodes[0]!.id;
    expect(() => loadStoryDocument(duplicate)).toThrow(/ID 重复/u);

    const brokenLink = structuredClone(storyJson);
    brokenLink.nodes[0]!.choices[0]!.next = "missing_node";
    expect(() => loadStoryDocument(brokenLink)).toThrow(/不存在的节点/u);

    const badMouth = structuredClone(storyJson);
    badMouth.characters.HAO_GE.expressions.talk.mouth.left.x = 101;
    expect(() => loadStoryDocument(badMouth)).toThrow();
  });

  it("仓库提供 JSON Schema 和中文协作说明", () => {
    expect(
      fs.existsSync(
        path.join(
          process.cwd(),
          "content",
          "schema",
          "story.schema.json",
        ),
      ),
    ).toBe(true);
    const guide = fs.readFileSync(
      path.join(process.cwd(), "content", "README.md"),
      "utf8",
    );
    expect(guide).toContain("npm run story:validate");
    expect(guide).toContain("playerPlacement");
    expect(guide).toContain("stage.bubble");
    expect(guide).toContain("mouth");
    expect(guide).toContain("stage.sequence.beats");
    expect(guide).toContain("narration");
    expect(guide).toContain("dialogue");
  });
});
