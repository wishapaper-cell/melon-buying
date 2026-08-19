import type {
  StorySequence,
  StorySequenceBeat,
  StorySequenceCharacterState,
} from "./types";

export type StorySequenceSnapshot = {
  characters: Record<string, StorySequenceCharacterState>;
  props: Record<string, { state: string; position?: { column: number; row: number } }>;
  bubble?: boolean;
  activeBeat?: StorySequenceBeat;
  complete: boolean;
};

export const sequenceDuration = (sequence: StorySequence | undefined) =>
  sequence?.beats.reduce((total, beat) => total + beat.durationMs, 0) ?? 0;

export const sequenceSnapshot = (
  sequence: StorySequence | undefined,
  completedBeatCount: number,
): StorySequenceSnapshot => {
  if (!sequence) {
    return { characters: {}, props: {}, complete: true };
  }
  const clampedCount = Math.max(
    0,
    Math.min(completedBeatCount, sequence.beats.length),
  );
  const characters: Record<string, StorySequenceCharacterState> = {};
  const props: StorySequenceSnapshot["props"] = {};
  let bubble: boolean | undefined;

  for (const beat of sequence.beats.slice(0, clampedCount + 1)) {
    for (const [characterId, state] of Object.entries(beat.characters)) {
      characters[characterId] = {
        ...characters[characterId],
        ...state,
      };
    }
    Object.assign(props, beat.props);
    if (beat.bubble !== undefined) bubble = beat.bubble;
  }

  return {
    characters,
    props,
    ...(bubble === undefined ? {} : { bubble }),
    activeBeat: sequence.beats[clampedCount],
    complete: clampedCount >= sequence.beats.length,
  };
};
