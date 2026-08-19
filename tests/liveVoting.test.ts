import { describe, expect, it } from "vitest";
import {
  canResolveStoryVote,
  createStoryVoteResult,
  nextVoteResultSecond,
  nextVotingSecond,
  parseCustomChoiceSubmission,
  parseStoryVote,
  selectStoryVoteWinner,
  STORY_VOTE_RESULT_SECONDS,
  STORY_VOTING_SECONDS,
  totalStoryVotes,
} from "../src/story/liveVoting";

describe("B站弹幕剧情投票", () => {
  it("每轮固定为60秒", () => {
    expect(STORY_VOTING_SECONDS).toBe(60);
    let remaining = STORY_VOTING_SECONDS;
    for (let second = 0; second < 60; second += 1) {
      remaining = nextVotingSecond(remaining);
    }
    expect(remaining).toBe(0);
    expect(nextVotingSecond(remaining)).toBe(0);
  });

  it.each([
    ["A", "A"],
    ["投票 a", "A"],
    ["1", "A"],
    ["选1", "A"],
    ["B", "B"],
    ["选择 2", "B"],
    ["3", "C"],
    ["投票C", "C"],
  ] as const)("解析弹幕 %s 为选项 %s", (message, expected) => {
    expect(parseStoryVote(message)).toBe(expected);
  });

  it("忽略无关弹幕", () => {
    expect(parseStoryVote("这个瓜多少钱")).toBeNull();
    expect(parseStoryVote("A B")).toBeNull();
    expect(parseStoryVote("D 绕到摊位后面看看")).toBeNull();
  });

  it("解析A/B/C开头的弹幕改写内容", () => {
    expect(parseCustomChoiceSubmission("A 绕到摊位后面看看")).toEqual({
      choiceId: "A",
      text: "绕到摊位后面看看",
    });
    expect(parseCustomChoiceSubmission("选择 B：先问问路人")).toEqual({
      choiceId: "B",
      text: "先问问路人",
    });
    expect(parseCustomChoiceSubmission("C")).toBeNull();
  });

  it("无人投票默认A，平票也按A/B/C顺序决定", () => {
    expect(selectStoryVoteWinner({ A: 0, B: 0, C: 0 })).toBe("A");
    expect(selectStoryVoteWinner({ A: 2, B: 2, C: 1 })).toBe("A");
    expect(selectStoryVoteWinner({ A: 1, B: 3, C: 3 })).toBe("B");
  });

  it("统计总票数", () => {
    expect(totalStoryVotes({ A: 2, B: 4, C: 1 })).toBe(7);
  });

  it("投票结束后固定公示20秒", () => {
    expect(STORY_VOTE_RESULT_SECONDS).toBe(20);
    let remaining = STORY_VOTE_RESULT_SECONDS;
    for (let second = 0; second < 20; second += 1) {
      remaining = nextVoteResultSecond(remaining);
    }
    expect(remaining).toBe(0);
    expect(nextVoteResultSecond(remaining)).toBe(0);
  });

  it("封票时生成独立结果快照", () => {
    const votes = { A: 2, B: 5, C: 1 };
    const result = createStoryVoteResult(votes);
    votes.B = 0;
    expect(result).toEqual({
      winner: "B",
      votes: { A: 2, B: 5, C: 1 },
      totalVotes: 8,
    });
  });

  it("新剧情节点初始化完成前不得沿用上一轮的0秒状态直接结算", () => {
    const transitionGate = {
      currentNodeId: "ask_price",
      preparedNodeId: "arrival",
      choiceCount: 3,
      moving: false,
      performing: false,
      hasResult: false,
      hasSelectedChoice: false,
    };

    expect(canResolveStoryVote(transitionGate)).toBe(false);
    expect(
      canResolveStoryVote({
        ...transitionGate,
        preparedNodeId: "ask_price",
      }),
    ).toBe(true);
  });
});
