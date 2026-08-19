import type { InteractiveNpc } from "../shared/types";

export const MELON_STREET_NPCS: InteractiveNpc[] = [
  {
    id: "HAO_GE",
    displayName: "郝哥",
    sceneId: "melon_street",
    position: { x: 58, y: 38 },
    interactionRadius: 14,
    supportedActions: ["OBSERVE", "QUESTION", "NEGOTIATE", "ACCUSE", "SHOW_EVIDENCE"],
    emotion: "CALM",
    goal: "把瓜卖出去，并避免台秤被仔细检查",
    personality: ["嘴硬", "精明", "爱面子", "遇到证据会紧张"],
    knownFacts: ["scale_contains_magnet", "price_sign_was_altered"],
    allowedAnimations: [
      "hao_idle",
      "hao_talk",
      "hao_angry",
      "hao_weigh",
      "hao_strike",
      "hao_fall",
      "hao_injured",
    ],
  },
  {
    id: "NEIGHBOR",
    displayName: "隔壁摊主",
    sceneId: "melon_street",
    position: { x: 69, y: 39 },
    interactionRadius: 12,
    supportedActions: ["OBSERVE", "QUESTION", "NEGOTIATE", "ACCUSE"],
    emotion: "CALM",
    goal: "守着自己的摊位，在冲突升级时呼救",
    personality: ["谨慎", "怕惹麻烦", "会在出事后呼救"],
    knownFacts: [],
    allowedAnimations: ["neighbor_idle", "neighbor_talk", "neighbor_watch"],
  },
];

export const NPCS_BY_ID = Object.fromEntries(
  MELON_STREET_NPCS.map((npc) => [npc.id, npc]),
) as Record<string, InteractiveNpc>;
