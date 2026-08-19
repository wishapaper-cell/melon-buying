import type { ActionType, Emotion, OptionId } from "./types";

export const ACTION_TYPES: ActionType[] = [
  "OBSERVE",
  "INSPECT",
  "QUESTION",
  "NEGOTIATE",
  "ACCUSE",
  "WEIGH",
  "MOVE",
  "USE",
  "CUT",
  "HOLD",
  "SHOW_EVIDENCE",
  "REPAIR",
  "RIDE",
  "SIT",
  "OPEN",
  "CALL",
  "LEAVE",
  "WAIT",
];

export const EMOTIONS: Emotion[] = [
  "CALM",
  "CONFIDENT",
  "SUSPICIOUS",
  "ANNOYED",
  "ANGRY",
  "NERVOUS",
  "AFRAID",
  "SARCASTIC",
];

export const OPTION_IDS: OptionId[] = ["A", "B", "C", "D", "E"];

export const ACTION_LABELS: Record<ActionType, string[]> = {
  OBSERVE: ["仔细观察", "换个角度看看", "先记住细节"],
  INSPECT: ["检查结构", "寻找异常", "查看隐藏处"],
  QUESTION: ["当面询问", "追问来历", "试探口风"],
  NEGOTIATE: ["提出商量", "尝试和解", "谈个条件"],
  ACCUSE: ["直接质问", "指出疑点", "要求解释"],
  WEIGH: ["重新称量", "拿标准复验", "观察秤针"],
  MOVE: ["挪开查看", "搬到亮处", "换个位置"],
  USE: ["试着使用", "测试功能", "借它一用"],
  CUT: ["切开检查", "换个位置下刀", "当面切瓜"],
  HOLD: ["拿起来看", "暂时收好", "托在手里"],
  SHOW_EVIDENCE: ["展示证据", "让大家看看", "摆到明处"],
  REPAIR: ["尝试修理", "重新校准", "检查故障"],
  RIDE: ["骑车离开", "试着发动", "推车上路"],
  SIT: ["坐下观察", "守在旁边", "占住凳子"],
  OPEN: ["打开看看", "掀开检查", "查看里面"],
  CALL: ["拨个电话", "联系帮手", "打听情况"],
  LEAVE: ["离开街口", "去别处调查", "暂时撤开"],
  WAIT: ["原地等待", "观察动静", "先不行动"],
};

export const ACTION_ANIMATIONS: Record<ActionType, string> = {
  OBSERVE: "actor_look",
  INSPECT: "actor_inspect",
  QUESTION: "actor_talk",
  NEGOTIATE: "actor_talk_calm",
  ACCUSE: "actor_point",
  WEIGH: "actor_place",
  MOVE: "actor_move_object",
  USE: "actor_use",
  CUT: "actor_cut",
  HOLD: "actor_pickup",
  SHOW_EVIDENCE: "actor_present",
  REPAIR: "actor_repair",
  RIDE: "vehicle_depart",
  SIT: "actor_sit",
  OPEN: "object_open",
  CALL: "actor_phone",
  LEAVE: "actor_walk",
  WAIT: "actor_wait",
};
