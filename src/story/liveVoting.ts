import type { StoryChoiceId } from "./types";

export const STORY_VOTING_SECONDS = 60;
export const STORY_VOTE_RESULT_SECONDS = 20;

export type StoryVoteResult = {
  winner: StoryChoiceId;
  votes: Record<StoryChoiceId, number>;
  totalVotes: number;
};

export type StoryVoteGate = {
  currentNodeId: string;
  preparedNodeId: string;
  choiceCount: number;
  moving: boolean;
  performing: boolean;
  hasResult: boolean;
  hasSelectedChoice: boolean;
};

export const STORY_CHOICE_IDS: readonly StoryChoiceId[] = [
  "A",
  "B",
  "C",
];

const VOTE_ALIASES: Record<string, StoryChoiceId> = {
  A: "A",
  "1": "A",
  B: "B",
  "2": "B",
  C: "C",
  "3": "C",
};

export const parseStoryVote = (message: string): StoryChoiceId | null => {
  const normalized = message
    .trim()
    .toUpperCase()
    .replace(/\s+/gu, "")
    .replace(/^(?:投票|选择|选)/u, "");
  return VOTE_ALIASES[normalized] ?? null;
};

export type CustomChoiceSubmission = {
  choiceId: StoryChoiceId;
  text: string;
};

export const parseCustomChoiceSubmission = (
  message: string,
): CustomChoiceSubmission | null => {
  const normalized = message.trim().replace(/^(?:投票|选择|选)\s*/u, "");
  const matched = normalized.match(/^([ABC])(?:\s+|[:：\-—]+)\s*(.+)$/iu);
  if (!matched?.[1] || !matched[2]) return null;
  const content = matched[2].trim().replace(/\s+/gu, " ");
  return content.length > 0
    ? {
        choiceId: matched[1].toUpperCase() as StoryChoiceId,
        text: content.slice(0, 80),
      }
    : null;
};

export const selectStoryVoteWinner = (
  votes: Readonly<Partial<Record<StoryChoiceId, number>>>,
  availableChoices: readonly StoryChoiceId[] = ["A", "B", "C"],
): StoryChoiceId => {
  const candidates =
    availableChoices.length > 0 ? availableChoices : (["A"] as const);
  return candidates.reduce((winner, choice) =>
    (votes[choice] ?? 0) > (votes[winner] ?? 0) ? choice : winner,
  );
};

export const totalStoryVotes = (
  votes: Readonly<Partial<Record<StoryChoiceId, number>>>,
): number =>
  STORY_CHOICE_IDS.reduce((total, choice) => total + (votes[choice] ?? 0), 0);

export const nextVotingSecond = (current: number): number =>
  Math.max(0, current - 1);

export const createStoryVoteResult = (
  votes: Readonly<Partial<Record<StoryChoiceId, number>>>,
  availableChoices: readonly StoryChoiceId[] = ["A", "B", "C"],
): StoryVoteResult => ({
  winner: selectStoryVoteWinner(votes, availableChoices),
  votes: {
    A: votes.A ?? 0,
    B: votes.B ?? 0,
    C: votes.C ?? 0,
  },
  totalVotes: totalStoryVotes(votes),
});

export const nextVoteResultSecond = (current: number): number =>
  Math.max(0, current - 1);

export const canResolveStoryVote = ({
  currentNodeId,
  preparedNodeId,
  choiceCount,
  moving,
  performing,
  hasResult,
  hasSelectedChoice,
}: StoryVoteGate): boolean =>
  currentNodeId === preparedNodeId &&
  choiceCount > 0 &&
  !moving &&
  !performing &&
  !hasResult &&
  !hasSelectedChoice;
