import type {
  DialogueGenerationContext,
  GeneratedDialogueTurn,
} from "../../shared/types";

export const buildFallbackDialogue = (
  context: DialogueGenerationContext,
): GeneratedDialogueTurn[] => {
  if (context.canonFixedLine) {
    return [
      {
        speakerId: "HUAQIANG",
        text: context.canonFixedLine,
        emotion: "CONFIDENT",
        animationCue: context.option.animationCue,
        facePortraitState: "huaqiang_confident",
        addressedTo: "VENDOR",
        conversationShouldContinue: true,
      },
    ];
  }

  const actorLine = context.actionResult.success
    ? actorSuccessLine(context)
    : "这一下没成，先看看周围再说。";
  const turns: GeneratedDialogueTurn[] = [
    {
      speakerId: "HUAQIANG",
      text: actorLine,
      emotion: context.actionResult.success ? "CONFIDENT" : "ANNOYED",
      animationCue: context.option.animationCue,
      facePortraitState: context.actionResult.success
        ? "huaqiang_confident"
        : "huaqiang_annoyed",
      revealedFacts: context.actionResult.revealedFacts,
      conversationShouldContinue: context.actionResult.dialogueShouldContinue,
    },
  ];

  const respondingNpc = context.option.targetNpcId ?? context.speakerIds.find(
    (speakerId) => speakerId !== "HUAQIANG",
  );
  if (context.actionResult.dialogueShouldContinue && respondingNpc) {
    turns.push({
      speakerId: respondingNpc,
      text: npcResponse(context),
      emotion: context.emotions[respondingNpc] ?? "SUSPICIOUS",
      animationCue: "npc_talk",
      facePortraitState: `${respondingNpc.toLowerCase()}_talk`,
      addressedTo: "HUAQIANG",
      conversationShouldContinue: false,
    });
  }
  return turns;
};

const actorSuccessLine = (context: DialogueGenerationContext): string => {
  if (context.actionResult.revealedFacts.length > 0) {
    return "有点意思，这个细节可得记清楚。";
  }
  if (context.option.actionType === "QUESTION") {
    return "我问一句，你照实说就行。";
  }
  if (context.option.actionType === "NEGOTIATE") {
    return "咱们把话说开，事情还能商量。";
  }
  if (context.option.actionType === "ACCUSE") {
    return "这事对不上，你得给个解释。";
  }
  return "先照这个办法试试，看它怎么变。";
};

const npcResponse = (context: DialogueGenerationContext): string => {
  if (context.tension >= 70) return "别围着起哄，有话一个一个说！";
  if (context.actionResult.revealedFacts.length > 0) {
    return "你先别下结论，这东西我也得看看。";
  }
  if (context.option.actionType === "NEGOTIATE") {
    return "价钱可以谈，别把场面弄得太难看。";
  }
  return "你想问什么就问，别耽误我做生意。";
};
