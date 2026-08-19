import { INITIAL_STORY_NODE, MELON_STORY } from "./melonStory";
import type {
  StoryChoiceId,
  StoryNode,
  StoryRuntime,
} from "./types";

export const createStoryRuntime = (): StoryRuntime => ({
  nodeId: INITIAL_STORY_NODE,
  route: [INITIAL_STORY_NODE],
  tension: 8,
  san: 80,
  canonRouteActive: true,
  selectedChoice: null,
});

export const chooseStoryOption = (
  runtime: StoryRuntime,
  choiceId: StoryChoiceId,
  currentNode: StoryNode = MELON_STORY[runtime.nodeId]!,
): StoryRuntime => {
  const selected = currentNode.choices.find((item) => item.id === choiceId);
  if (!selected) return runtime;
  return {
    nodeId: selected.next,
    route: [...runtime.route, selected.next],
    tension: Math.max(0, Math.min(100, runtime.tension + selected.tensionDelta)),
    san: Math.max(
      0,
      Math.min(
        100,
        runtime.san +
          (selected.sanDelta ??
            (selected.tensionDelta > 0
              ? -Math.max(1, Math.ceil(selected.tensionDelta / 4))
              : Math.ceil(Math.abs(selected.tensionDelta) / 5))),
      ),
    ),
    canonRouteActive: runtime.canonRouteActive && selected.canonical,
    // 选项高亮只属于离开旧节点前的移动阶段；进入新节点后必须释放，
    // 否则下一轮投票会被误判为已经完成选择而无法启动。
    selectedChoice: null,
  };
};

export const autoAdvanceStory = (
  runtime: StoryRuntime,
  currentNode: StoryNode = MELON_STORY[runtime.nodeId]!,
): StoryRuntime => {
  const next = currentNode.autoAdvanceTo;
  if (!next) return runtime;
  return {
    ...runtime,
    nodeId: next,
    route: [...runtime.route, next],
    selectedChoice: null,
  };
};

export const validateStory = (): string[] => {
  const errors: string[] = [];
  for (const node of Object.values(MELON_STORY)) {
    if (!node.ending && !node.autoAdvanceTo && node.choices.length !== 3) {
      errors.push(`${node.id} 必须有且仅有三个选项`);
    }
    for (const option of node.choices) {
      if (!MELON_STORY[option.next]) {
        errors.push(`${node.id}.${option.id} 指向不存在的 ${option.next}`);
      }
    }
    if (node.autoAdvanceTo && !MELON_STORY[node.autoAdvanceTo]) {
      errors.push(`${node.id} 自动跳转目标不存在`);
    }
  }
  return errors;
};
