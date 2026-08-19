import storyJson from "../content/stories/melon-story.json";
import { MARKET_PROP_BLOCKERS } from "../src/game/sceneProps";
import { planPathToSafeDestination } from "../src/game/isometric";
import { loadStoryDocument } from "../src/story/storySchema";

const document = loadStoryDocument(storyJson);
const npcBlockers = new Set(
  Object.entries(document.characters)
    .filter(([characterId]) => characterId !== "HUAQIANG")
    .map(
      ([, character]) =>
        `${character.initialPosition.column},${character.initialPosition.row}`,
    ),
);
const blockers = new Set([...MARKET_PROP_BLOCKERS, ...npcBlockers]);
const playerStart = document.characters.HUAQIANG?.initialPosition;

if (!playerStart) {
  throw new Error("必须定义 HUAQIANG 角色和初始站位");
}

for (const node of document.nodes) {
  const destination = node.stagePlacement?.destination;
  if (!destination) continue;
  const plan = planPathToSafeDestination(
    playerStart,
    destination,
    blockers,
  );
  if (!plan) {
    throw new Error(
      `节点 ${node.id} 的站位 ${destination.column},${destination.row} 不可达`,
    );
  }
  if (
    plan.destination.column !== destination.column ||
    plan.destination.row !== destination.row
  ) {
    throw new Error(
      `节点 ${node.id} 的站位被占用；最近可达格为 ` +
        `${plan.destination.column},${plan.destination.row}`,
    );
  }
}

const expressionCount = Object.values(document.characters).reduce(
  (total, character) => total + Object.keys(character.expressions).length,
  0,
);

console.log(
  [
    `剧情校验通过：${document.title}`,
    `角色 ${Object.keys(document.characters).length} 个`,
    `表情 ${expressionCount} 个`,
    `节点 ${document.nodes.length} 个`,
    `经典路线 ${document.canonRoute.length} 个节点`,
  ].join("；"),
);
