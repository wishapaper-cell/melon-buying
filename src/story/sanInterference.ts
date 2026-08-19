import type { SanStage } from "../game/realtimeWorld";
import type {
  StoryChoice,
  StoryChoiceId,
  StoryNode,
} from "./types";

const WEIRD_CHOICES = [
  {
    label: "问问树怎么想",
    description: "那棵树一直在听，它也许比所有人都清楚。",
  },
  {
    label: "假装自己是西瓜",
    description: "只要足够像瓜，秤或许会主动说出真相。",
  },
  {
    label: "跟影子讲价",
    description: "地上的影子已经伸出两根手指，像是在报价。",
  },
  {
    label: "数不存在的瓜",
    description: "摊位后面还有一些瓜，闭上一只眼才能看见。",
  },
  {
    label: "听秤盘笑完",
    description: "台秤正在憋笑，等它笑完也许会自己认错。",
  },
  {
    label: "请胖龙作证",
    description: "黄色的家伙就在旁边，只是其他人还没发现。",
  },
] as const;

const GLITCH_GLYPHS = ["…", "※", "？", "嘻", "▓"] as const;

const hashOf = (value: string): number => {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const safeSegment = (value: string): string =>
  value.replace(/[^a-zA-Z0-9_]+/gu, "_").slice(-36);

const corruptText = (
  text: string | undefined,
  seed: string,
  intensity: number,
): string | undefined => {
  if (!text) return text;
  const characters = Array.from(text);
  const hash = hashOf(seed);
  const interval = intensity > 1 ? 7 : 13;
  for (
    let index = hash % interval;
    index < characters.length;
    index += interval
  ) {
    const character = characters[index];
    if (character && !/[\s，。！？、；：“”]/u.test(character)) {
      characters[index] =
        GLITCH_GLYPHS[(hash + index) % GLITCH_GLYPHS.length]!;
    }
  }
  const whisper =
    intensity > 1
      ? "（别回头，树正在数你。）"
      : "（刚才是谁笑了？）";
  return `${characters.join("")}${whisper}`;
};

const createWeirdChoice = (
  node: StoryNode,
  choice: StoryChoice,
  routeRevision: number,
  index: number,
  intense: boolean,
): StoryChoice => {
  const weird =
    WEIRD_CHOICES[
      (hashOf(`${node.id}:${choice.id}:${routeRevision}`) + index) %
        WEIRD_CHOICES.length
    ]!;
  return {
    ...choice,
    label: weird.label,
    description: intense
      ? `${weird.description} ※ 它坚持这是唯一正确的选项。`
      : `${weird.description} ※ 你不记得自己想过这个。`,
    next: `san_${safeSegment(node.id)}_${routeRevision}_${choice.id.toLowerCase()}`,
    canonical: false,
    tensionDelta: Math.max(5, choice.tensionDelta),
    sanDelta: intense ? -6 : -3,
  };
};

export const applySanInterference = (
  node: StoryNode,
  sanStage: SanStage,
  routeRevision: number,
): StoryNode => {
  if (sanStage === "NORMAL") return node;
  const intense = sanStage === "ANOMALY";
  const weirdChoiceIndex =
    node.choices.length > 0
      ? hashOf(`${node.id}:${routeRevision}`) % node.choices.length
      : -1;
  const choices = node.choices.map((choice, index) => {
    if (intense || index === weirdChoiceIndex) {
      return createWeirdChoice(
        node,
        choice,
        routeRevision,
        index,
        intense,
      );
    }
    return {
      ...choice,
      label:
        corruptText(
          choice.label,
          `${node.id}:${choice.id}:label`,
          1,
        ) ?? choice.label,
      description:
        corruptText(
          choice.description,
          `${node.id}:${choice.id}:description`,
          1,
        ) ?? choice.description,
    };
  });

  return {
    ...node,
    narration:
      corruptText(node.narration, `${node.id}:narration`, intense ? 2 : 1) ??
      node.narration,
    dialogue: corruptText(
      node.dialogue,
      `${node.id}:dialogue`,
      intense ? 2 : 1,
    ),
    stageDirection:
      corruptText(
        node.stageDirection,
        `${node.id}:stage`,
        intense ? 2 : 1,
      ) ?? node.stageDirection,
    choices,
  };
};

export const isSanInterferenceChoice = (
  node: StoryNode,
  choiceId: StoryChoiceId,
): boolean => node.choices.some(
  (choice) =>
    choice.id === choiceId &&
    choice.next.startsWith("san_"),
);
