import type {
  GeneratedDialogueTurn,
  InteractionContext,
  RuntimeOption,
} from "../shared/types";

export type CanonBeat = {
  id: string;
  objectId: string;
  optionLabel: string;
  optionDescription: string;
  actionType: RuntimeOption["actionType"];
  fixedLine: string;
  animationCue: string;
};

export const CANON_BEATS: Record<string, CanonBeat> = {
  price_question: {
    id: "price_question",
    objectId: "price_sign",
    optionLabel: "质疑瓜为什么这么贵",
    optionDescription: "按经典路线追问瓜价。",
    actionType: "QUESTION",
    fixedLine:
      "What’s up，这瓜皮子是金子做的还是这瓜粒子是金子做的",
    animationCue: "huaqiang_question_price",
  },
};

export const getActiveCanonBeat = (
  context: InteractionContext,
): CanonBeat | null => {
  if (!context.canonRouteActive || !context.canonBeatId) return null;
  const beat = CANON_BEATS[context.canonBeatId];
  if (!beat || beat.objectId !== context.objectId) return null;
  return beat;
};

export const buildCanonOption = (
  context: InteractionContext,
): RuntimeOption | null => {
  const beat = getActiveCanonBeat(context);
  if (!beat) return null;
  return {
    id: "A",
    shortLabel: beat.optionLabel,
    description: beat.optionDescription,
    actionType: beat.actionType,
    actorId: context.actorId,
    targetObjectId: beat.objectId,
    intent: "按经典节拍质疑瓜价",
    expectedTone: "CONFIDENT",
    canonical: true,
    requiredObjects: [beat.objectId],
    requiredFacts: [],
    forbiddenFacts: [],
    animationCue: beat.animationCue,
    riskLevel: 2,
  };
};

export const getCanonFixedDialogue = (
  option: { canonical: boolean; id: string },
  context: InteractionContext,
): GeneratedDialogueTurn[] | null => {
  if (!option.canonical || option.id !== "A") return null;
  const beat = getActiveCanonBeat(context);
  if (!beat) return null;
  return [
    {
      speakerId: "HUAQIANG",
      text: beat.fixedLine,
      emotion: "CONFIDENT",
      animationCue: beat.animationCue,
      facePortraitState: "huaqiang_confident",
      addressedTo: "VENDOR",
      conversationShouldContinue: true,
    },
  ];
};
