import {
  ACTION_ANIMATIONS,
  ACTION_LABELS,
} from "../shared/constants";
import type {
  ActionType,
  InteractionContext,
  LiveOption,
  Proposal,
} from "../shared/types";

const KEYWORD_ACTIONS: Array<[RegExp, ActionType]> = [
  [/展示|证据|给.*看/, "SHOW_EVIDENCE"],
  [/重新?称|复验|秤一下/, "WEIGH"],
  [/检查|查看|翻|找|底下|后面/, "INSPECT"],
  [/问|打听|追问/, "QUESTION"],
  [/商量|和解|谈价/, "NEGOTIATE"],
  [/质问|揭穿|指责/, "ACCUSE"],
  [/修|校准/, "REPAIR"],
  [/骑|发动/, "RIDE"],
  [/电话|报警|联系/, "CALL"],
  [/切|劈/, "CUT"],
  [/坐|凳/, "SIT"],
  [/打开|掀开/, "OPEN"],
  [/搬|挪|带走/, "MOVE"],
  [/拿|捡|抱/, "HOLD"],
  [/离开|走|出去/, "LEAVE"],
  [/等|不动/, "WAIT"],
  [/看|观察/, "OBSERVE"],
];

const UNSAFE_PROPOSAL =
  /杀|砍人|捅人|放火|自杀|强奸|炸掉|弄死|打死|严重伤害/u;

const inferAction = (
  text: string,
  allowed: ActionType[],
): ActionType | null => {
  for (const [pattern, action] of KEYWORD_ACTIONS) {
    if (!pattern.test(text)) continue;
    return allowed.includes(action) ? action : null;
  }
  return null;
};

const normalizeProposal = (text: string): string =>
  text
    .replace(/^#提案\s*/u, "")
    .trim()
    .slice(0, 40);

export const synthesizeFallbackE = (
  proposals: Proposal[],
  context: InteractionContext,
): LiveOption => {
  const candidates = proposals
    .map((proposal) => {
      const text = normalizeProposal(proposal.text);
      return {
        text,
        action: UNSAFE_PROPOSAL.test(text)
          ? null
          : inferAction(text, context.supportedActions),
        timestamp: proposal.timestamp,
      };
    })
    .filter(
      (item): item is { text: string; action: ActionType; timestamp: number } =>
        !!item.text && !!item.action,
    );

  const grouped = new Map<
    ActionType,
    { count: number; latest: number; texts: string[] }
  >();
  for (const candidate of candidates) {
    const current = grouped.get(candidate.action) ?? {
      count: 0,
      latest: 0,
      texts: [],
    };
    current.count += 1;
    current.latest = Math.max(current.latest, candidate.timestamp);
    current.texts.push(candidate.text);
    grouped.set(candidate.action, current);
  }
  const winningGroup = [...grouped.entries()].sort(
    ([, a], [, b]) => b.count - a.count || b.latest - a.latest,
  )[0];
  const action = winningGroup?.[0] ?? context.supportedActions[0] ?? "OBSERVE";
  const sourceText = winningGroup?.[1].texts[0];
  const shortLabel = sourceText
    ? Array.from(sourceText).slice(0, 14).join("")
    : "观察后再决定";
  const targetFields =
    context.targetKind === "OBJECT"
      ? { targetObjectId: context.objectId }
      : { targetNpcId: context.objectId };

  return {
    id: "E",
    shortLabel,
    description: sourceText
      ? `由${winningGroup![1].count}条同类弹幕归纳。`
      : "当前没有有效提案，采用安全保底行动。",
    actionType: action,
    actorId: context.actorId,
    ...targetFields,
    intent: `audience_proposal:${action}`,
    expectedTone: "CONFIDENT",
    canonical: false,
    requiredObjects:
      context.targetKind === "OBJECT" ? [context.objectId] : [],
    requiredFacts: [],
    forbiddenFacts: [],
    animationCue: ACTION_ANIMATIONS[action],
    riskLevel: ["ACCUSE", "MOVE", "RIDE"].includes(action) ? 3 : 1,
  };
};

export const proposalSuggestion = (
  context: InteractionContext,
): string => {
  const action = context.supportedActions[0] ?? "OBSERVE";
  return `#提案 ${ACTION_LABELS[action][0]}${context.targetDisplayName}`;
};
