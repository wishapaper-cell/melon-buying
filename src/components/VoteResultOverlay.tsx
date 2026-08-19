import {
  STORY_VOTE_RESULT_SECONDS,
  type StoryVoteResult,
} from "../story/liveVoting";
import type { StoryNode } from "../story/types";

type Props = {
  node: StoryNode;
  result: StoryVoteResult;
  remainingSeconds: number;
};

export function VoteResultOverlay({
  node,
  result,
  remainingSeconds,
}: Props) {
  const winner = node.choices.find((choice) => choice.id === result.winner);
  const noVotes = result.totalVotes === 0;

  return (
    <div className="vote-result-overlay">
      <section
        className="vote-result-panel"
        role="dialog"
        aria-modal="true"
        aria-label="本轮弹幕投票结果"
      >
        <header className="vote-result-heading">
          <span>VOTE CLOSED</span>
          <strong>本轮投票结果</strong>
          <small>共收到 {result.totalVotes} 票</small>
        </header>

        <div className="vote-result-winner">
          <span>最终选择</span>
          <b>{result.winner}</b>
          <strong>{winner?.label ?? `选项 ${result.winner}`}</strong>
          <small>
            {noVotes ? "本轮无人投票，已按规则默认选择 A" : "票数最高，世界线即将推进"}
          </small>
        </div>

        <div className="vote-result-list">
          {node.choices.map((choice) => {
            const count = result.votes[choice.id];
            const share =
              result.totalVotes > 0 ? (count / result.totalVotes) * 100 : 0;
            const selected = choice.id === result.winner;

            return (
              <div
                className={`vote-result-item ${selected ? "is-winner" : ""}`}
                key={choice.id}
              >
                <b>{choice.id}</b>
                <span>
                  <strong>{choice.label}</strong>
                  <small>{selected ? "胜出" : "未选中"}</small>
                </span>
                <em>{count}<small>票</small></em>
                <i aria-hidden="true">
                  <b style={{ width: `${share}%` }} />
                </i>
              </div>
            );
          })}
        </div>

        <footer className="vote-result-footer">
          <span>结果公示中，弹幕投票已停止</span>
          <div>
            <small>剧情将在</small>
            <strong>{remainingSeconds}</strong>
            <small>秒后继续</small>
          </div>
          <i aria-hidden="true">
            <b
              style={{
                width: `${(remainingSeconds / STORY_VOTE_RESULT_SECONDS) * 100}%`,
              }}
            />
          </i>
        </footer>
      </section>
    </div>
  );
}
