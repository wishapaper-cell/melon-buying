import storyJson from "../../content/stories/melon-story.json";
import { loadStoryDocument } from "./storySchema";

export const STORY_DOCUMENT = loadStoryDocument(storyJson);

export const MELON_STORY = Object.fromEntries(
  STORY_DOCUMENT.nodes.map((node) => [node.id, node]),
);

export const STORY_CHARACTERS = STORY_DOCUMENT.characters;
export const INITIAL_STORY_NODE = STORY_DOCUMENT.entryNodeId;
export const CANON_ROUTE = STORY_DOCUMENT.canonRoute;

export const STORY_NPC_BLOCKERS = new Set(
  Object.entries(STORY_CHARACTERS)
    .filter(([characterId]) => characterId !== "HUAQIANG")
    .map(
      ([, character]) =>
        `${character.initialPosition.column},${character.initialPosition.row}`,
    ),
);

export const getStoryExpression = (
  characterId: string,
  expressionId?: string,
) => {
  const character = STORY_CHARACTERS[characterId];
  if (!character) return undefined;
  return character.expressions[
    expressionId ?? character.defaultExpression
  ];
};
