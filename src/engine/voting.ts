import { OPTION_IDS } from "../shared/constants";
import type { LiveOption, OptionId, VoteHistoryEntry } from "../shared/types";

export class VoteSession {
  private readonly votesByViewer = new Map<string, OptionId>();
  private readonly messageIds = new Set<string>();
  private closed = false;

  constructor(
    readonly interactionId: string,
    readonly options: LiveOption[],
  ) {
    const ids = new Set(options.map((option) => option.id));
    if (OPTION_IDS.some((id) => !ids.has(id))) {
      throw new Error("投票必须包含A、B、C、D、E五个选项");
    }
  }

  cast(viewerId: string, optionId: OptionId, messageId: string): boolean {
    if (this.closed || !OPTION_IDS.includes(optionId)) return false;
    if (this.messageIds.has(messageId)) return false;
    this.messageIds.add(messageId);
    this.votesByViewer.set(viewerId, optionId);
    return true;
  }

  counts(): Record<OptionId, number> {
    const result: Record<OptionId, number> = {
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      E: 0,
    };
    this.votesByViewer.forEach((id) => {
      result[id] += 1;
    });
    return result;
  }

  close(timestamp = Date.now()): {
    option: LiveOption;
    history: VoteHistoryEntry;
  } {
    this.closed = true;
    const counts = this.counts();
    const winnerId = OPTION_IDS.reduce((winner, id) =>
      counts[id] > counts[winner] ? id : winner,
    );
    const option = this.options.find((item) => item.id === winnerId);
    if (!option) throw new Error("获胜选项不存在");
    return {
      option,
      history: {
        interactionId: this.interactionId,
        winningOptionId: winnerId,
        counts,
        timestamp,
      },
    };
  }
}

export const parseVoteText = (text: string): OptionId | null => {
  const match = text.trim().toUpperCase().match(/^(?:投票\s*)?([ABCDE])$/u);
  return (match?.[1] as OptionId | undefined) ?? null;
};
