import type { StoryChoiceId, StoryNode } from "../story/types";
import { STORY_VOTING_SECONDS } from "../story/liveVoting";

type Props = {
  node: StoryNode;
  moving: boolean;
  performing: boolean;
  performingLabel?: string;
  selectedChoice: StoryChoiceId | null;
  voteCounts: Record<StoryChoiceId, number>;
  votingSeconds: number;
  votingOpen: boolean;
  agentLoading: boolean;
  audienceProposalCounts: Partial<Record<StoryChoiceId, number>>;
  audienceOverriddenChoices: StoryChoiceId[];
  liveState: string;
  totalVotes: number;
  onRestart: () => void;
};

export function StoryPanel({
  node,
  moving,
  performing,
  performingLabel,
  selectedChoice,
  voteCounts,
  votingSeconds,
  votingOpen,
  agentLoading,
  audienceProposalCounts,
  audienceOverriddenChoices,
  liveState,
  totalVotes,
  onRestart,
}: Props) {
  const liveConnected = liveState === "connected";
  const votingMinutes = Math.floor(votingSeconds / 60);
  const votingRemainder = votingSeconds % 60;
  const votingClock = `${String(votingMinutes).padStart(2, "0")}:${String(
    votingRemainder,
  ).padStart(2, "0")}`;
  const statusText = liveConnected
    ? "B站弹幕已连接"
    : liveState === "error"
      ? "B站连接失败"
      : liveState === "offline"
        ? "B站服务离线"
      : liveState === "unconfigured"
        ? "等待B站配置"
        : "正在连接B站";
  return (
    <section className="story-panel" aria-live="polite">
      <header className="story-heading">
        <div>
          <span>{node.chapter}</span>
          <strong>场景旁白</strong>
        </div>
        <p>{node.stageDirection}</p>
      </header>

      <div className="story-dialogue">
        <i aria-hidden="true">旁</i>
        <p>{node.narration}</p>
      </div>

      {moving || performing ? (
        <div className="story-moving">
          <span />
          {moving
            ? "华强正在前往所选位置……"
            : performingLabel
              ? `导演 Agent：${performingLabel}`
              : "场景分镜演出中……"}
        </div>
      ) : agentLoading ? (
        <div className="story-moving story-agent-loading">
          <span />
          <div>
            <strong>剧情 Agent 正在接管世界线</strong>
            <small>正在生成下一轮 A / B / C，场景时间不会暂停……</small>
          </div>
        </div>
      ) : node.ending && node.choices.length === 0 ? (
        <div className="story-ending">
          <strong>
            {node.ending === "CANON" ? "经典世界线完成" : "支线世界线完成"}
          </strong>
          <button type="button" onClick={onRestart}>从街口重新开始</button>
        </div>
      ) : node.choices.length === 0 ? (
        <div className="story-moving">
          <span />
          剧情演出中……
        </div>
      ) : (
        <>
          <div className="story-vote-hint">
            <div
              className={`live-vote-status ${liveConnected ? "is-live" : ""}`}
            >
              <i />
              <span>{statusText}</span>
            </div>
            <span className="vote-instruction">
              弹幕发送 <b>A / B / C</b>
              <small>
                发送“A 自定义描述”可改写对应选项 · 每人一票，可改选
              </small>
            </span>
            <div
              className={[
                "vote-round-timer",
                votingSeconds <= 10 ? "is-closing" : "",
                !votingOpen ? "is-closed" : "",
              ].join(" ")}
              aria-label={`距离投票结束还有 ${votingSeconds} 秒`}
            >
              <small>距离封票 · 共 {totalVotes} 票</small>
              <strong>{votingClock}</strong>
              <b>
                <i
                  style={{
                    width: `${(votingSeconds / STORY_VOTING_SECONDS) * 100}%`,
                  }}
                />
              </b>
            </div>
          </div>
          <div
            className="story-options"
            data-option-count={node.choices.length}
          >
            {node.choices.map((option) => {
              const optionVotes = voteCounts[option.id];
              const voteShare =
                totalVotes > 0 ? (optionVotes / totalVotes) * 100 : 0;

              return (
                <button
                  type="button"
                  key={option.id}
                  className={[
                    "story-option",
                    option.canonical ? "is-canon" : "",
                    audienceOverriddenChoices.includes(option.id)
                      ? "is-audience"
                      : "",
                    selectedChoice === option.id ? "is-selected" : "",
                  ].join(" ")}
                  aria-label={`${option.id}，${option.label}，当前 ${optionVotes} 票`}
                  disabled
                >
                  <b className="story-option-key">{option.id}</b>
                  <span className="story-option-copy">
                    <strong>{option.label}</strong>
                    <small>{option.description}</small>
                    {audienceOverriddenChoices.includes(option.id) ? (
                      <em>
                        弹幕改写 · {audienceProposalCounts[option.id] ?? 0} 条提案
                      </em>
                    ) : null}
                  </span>
                  <span className="story-option-tally" aria-hidden="true">
                    <em key={`${node.id}-${option.id}-${optionVotes}`}>
                      {optionVotes}
                    </em>
                    <small>票</small>
                  </span>
                  <span className="story-option-meter" aria-hidden="true">
                    <i style={{ width: `${voteShare}%` }} />
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
