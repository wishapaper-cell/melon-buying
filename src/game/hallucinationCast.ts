export const HALLUCINATION_KINDS = [
  "NAILONG",
  "GUGA",
  "KNIFE_SHIELD",
  "BIBILA",
] as const;

export type HallucinationKind = (typeof HALLUCINATION_KINDS)[number];

const SPRITE_STEM: Record<HallucinationKind, string> = {
  NAILONG: "nailong",
  GUGA: "guga",
  KNIFE_SHIELD: "knife_shield",
  BIBILA: "bibila",
};

export const HALLUCINATION_AUDIO: Record<HallucinationKind, string> = {
  NAILONG: "/assets/audio/nailong-laugh.mp3",
  GUGA: "/assets/audio/7月25日(1)咕咕嘎嘎.MP3",
  KNIFE_SHIELD: "/assets/audio/7月25日(1)我的刀盾.MP3",
  BIBILA: "/assets/audio/7月25日(1)比比拉布.MP3",
};

const hashText = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const hallucinationKindFor = (
  entityId: string,
  timestamp: number,
): HallucinationKind => {
  const timeBucket = Math.floor(timestamp / 8_000);
  const index =
    hashText(`${entityId}:${timeBucket}`) % HALLUCINATION_KINDS.length;
  return HALLUCINATION_KINDS[index]!;
};

export const hallucinationFrameFor = (
  entityId: string,
  animationFrame: number,
): number => (animationFrame + hashText(entityId)) % 4;

export const hallucinationSprite = (
  kind: HallucinationKind,
  direction: "left" | "right",
  frame: number,
): string =>
  `/assets/generated/sprites/hallucinations/${SPRITE_STEM[kind]}_${direction}_${frame % 4}.png`;
