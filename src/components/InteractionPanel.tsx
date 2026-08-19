import type {
  GeneratedDialogueTurn,
  LiveOption,
  OptionId,
  Proposal,
  RuntimeInteractionOptions,
} from "../shared/types";

export type InteractionPhase =
  | "EXPLORATION"
  | "GENERATING"
  | "PROPOSAL"
  | "VOTING"
  | "RESOLVING"
  | "DIALOGUE";

type Props = {
  phase: InteractionPhase;
  targetName: string;
  runtimeOptions: RuntimeInteractionOptions | null;
  liveOptions: LiveOption[];
  proposals: Proposal[];
  counts: Record<OptionId, number>;
  turns: GeneratedDialogueTurn[];
  notice: string | null;
  onSynthesize: () => void;
  onVote: (id: OptionId) => void;
  onSettle: () => void;
  onContinue: () => void;
  onClose: () => void;
};

const optionClass = (option: LiveOption): string =>
  `option-card ${option.canonical ? "is-canon" : ""}`;

export function InteractionPanel({
  phase,
  targetName,
  runtimeOptions,
  liveOptions,
  proposals,
  counts,
  turns,
  notice,
  onSynthesize,
  onVote,
  onSettle,
  onContinue,
  onClose,
}: Props) {
  if (phase === "EXPLORATION") return null;
  return (
    <aside className="interaction-panel" aria-live="polite">
      <div className="panel-header">
        <div>
          <span className="eyebrow">INTERACTION / 实时交互</span>
          <h2>{targetName || "正在读取世界状态"}</h2>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="关闭交互">
          ×
        </button>
      </div>

      {notice && <div className="degraded-notice">{notice}</div>}

      {(phase === "GENERATING" || phase === "RESOLVING") && (
        <div className="loading-state">
          <span className="loading-pixels" />
          <p>{phase === "GENERATING" ? "AI正在读取物品、人物和世界线…" : "规则系统正在结算实际行动…"}</p>
        </div>
      )}

      {phase === "PROPOSAL" && runtimeOptions && (
        <>
          <div className="phase-strip">
            <span>01 固定四项</span>
            <strong>02 征集 E 提案</strong>
            <span>03 投票</span>
          </div>
          <div className="options-grid">
            {runtimeOptions.options.map((option) => (
              <article className={optionClass(option)} key={option.id}>
                <span className="option-key">{option.id}</span>
                <div>
                  <h3>{option.shortLabel}</h3>
                  <p>{option.description}</p>
                </div>
                <small>{option.actionType}</small>
              </article>
            ))}
            <article className="option-card option-e is-collecting">
              <span className="option-key">E</span>
              <div>
                <h3>弹幕自定义提案</h3>
                <p>发送“#提案 行动内容”参与归纳</p>
              </div>
              <small>{proposals.length} 条</small>
            </article>
          </div>
          <div className="panel-actions">
            <span>已收集 {proposals.length} 条有效提案</span>
            <button type="button" className="primary-button" onClick={onSynthesize}>
              归纳 E 并开始投票
            </button>
          </div>
        </>
      )}

      {phase === "VOTING" && (
        <>
          <div className="phase-strip">
            <span>01 固定四项</span>
            <span>02 E 已生成</span>
            <strong>03 弹幕投票</strong>
          </div>
          <div className="options-grid voting-grid">
            {liveOptions.map((option) => (
              <button
                type="button"
                className={optionClass(option)}
                key={option.id}
                onClick={() => onVote(option.id)}
              >
                <span className="option-key">{option.id}</span>
                <div>
                  <h3>{option.shortLabel}</h3>
                  <p>{option.description}</p>
                </div>
                <strong className="vote-count">{counts[option.id]}</strong>
              </button>
            ))}
          </div>
          <div className="panel-actions">
            <span>弹幕发送 A / B / C / D / E 投票</span>
            <button type="button" className="primary-button danger" onClick={onSettle}>
              结束投票并执行
            </button>
          </div>
        </>
      )}

      {phase === "DIALOGUE" && (
        <div className="dialogue-stage">
          <div className="dialogue-feed">
            {turns.map((turn, index) => (
              <article className="dialogue-line" key={`${turn.speakerId}-${index}`}>
                <div className={`portrait emotion-${turn.emotion.toLowerCase()}`}>
                  {turn.speakerId === "HUAQIANG" ? "强" : "人"}
                </div>
                <div>
                  <span>{speakerName(turn.speakerId)} · {turn.emotion}</span>
                  <p>{turn.text}</p>
                </div>
              </article>
            ))}
          </div>
          <div className="panel-actions">
            <button type="button" className="secondary-button" onClick={onClose}>
              返回探索
            </button>
            <button type="button" className="primary-button" onClick={onContinue}>
              根据新状态继续互动
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

const speakerName = (id: string): string => {
  const names: Record<string, string> = {
    HUAQIANG: "华强",
    VENDOR: "瓜摊老板",
    VENDOR_ASSISTANT: "瓜摊伙计",
    ONLOOKER_01: "围观街坊",
  };
  return names[id] ?? id;
};
