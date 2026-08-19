import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  gridDepth,
  ISO_TILES,
  projectGridToPixel,
  TILE_HEIGHT,
  TILE_WIDTH,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  type PlayerRuntimeState,
} from "../game/isometric";
import {
  MARKET_PROPS,
  MARKET_VEGETATION,
} from "../game/sceneProps";
import {
  ambientEmojiVisible,
  ambientSprite,
  type AmbientEntity,
} from "../game/ambientWorld";
import {
  anomalyVisibleFor,
  type RealtimeWorld,
} from "../game/realtimeWorld";
import {
  HALLUCINATION_AUDIO,
  HALLUCINATION_KINDS,
  hallucinationFrameFor,
  hallucinationKindFor,
  hallucinationSprite,
  type HallucinationKind,
} from "../game/hallucinationCast";
import {
  normalizeStoryPropState,
  type ObjectRuntime,
} from "../game/objectRuntime";
import {
  getStoryExpression,
  STORY_CHARACTERS,
} from "../story/melonStory";
import { sequenceSnapshot } from "../story/sequenceRuntime";
import type { StoryNode } from "../story/types";
import type { DirectorPresentation } from "../story/directorExecutor";

type Props = {
  node: StoryNode;
  player: PlayerRuntimeState;
  world: RealtimeWorld;
  ambientEntities: AmbientEntity[];
  directorObjects: Record<string, ObjectRuntime>;
  directorPresentation: DirectorPresentation;
  onPerformingChange?: (performing: boolean) => void;
};

const PLAYER_FRAMES = {
  right: Array.from(
    { length: 8 },
    (_, index) => `/assets/generated/sprites/player_walk_right_${index}.png`,
  ),
  left: Array.from(
    { length: 8 },
    (_, index) => `/assets/generated/sprites/player_walk_left_${index}.png`,
  ),
};
const expressionSprite = (
  characterId: string,
  expressionId: string | undefined,
  facing: "left" | "right",
): string | undefined => {
  const definition = getStoryExpression(characterId, expressionId);
  if (!definition?.sprites) return undefined;
  return typeof definition.sprites === "string"
    ? definition.sprites
    : definition.sprites[facing];
};

export function MarketScene({
  node,
  player,
  world,
  ambientEntities,
  directorObjects,
  directorPresentation,
  onPerformingChange,
}: Props) {
  const viewportRef = useRef<HTMLElement>(null);
  const hallucinationAudioRefs = useRef<
    Partial<Record<HallucinationKind, HTMLAudioElement>>
  >({});
  const visibleHallucinationKindsRef = useRef<HallucinationKind[]>([]);
  const [viewport, setViewport] = useState({ width: 960, height: 640 });
  const [fallFrame, setFallFrame] = useState(0);
  const [hallucinationFrame, setHallucinationFrame] = useState(0);
  const [sequenceProgress, setSequenceProgress] = useState({
    nodeId: node.id,
    completedBeats: 0,
  });
  const playerPixel = projectGridToPixel(player);
  const completedBeats =
    sequenceProgress.nodeId === node.id
      ? sequenceProgress.completedBeats
      : 0;
  const sequenceState = sequenceSnapshot(node.sequence, completedBeats);
  const sequencePerforming = Boolean(node.sequence && !sequenceState.complete);
  const activeBeatMoves = Object.values(
    sequenceState.activeBeat?.characters ?? {},
  ).some((state) => Boolean(state.position));
  const currentBeatDuration = sequenceState.activeBeat
    ? activeBeatMoves
      ? Math.min(520, sequenceState.activeBeat.durationMs)
      : sequenceState.activeBeat.bubble
        ? 160
        : 80
    : 100;

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const resize = () =>
      setViewport({ width: element.clientWidth, height: element.clientHeight });
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const audioByKind = Object.fromEntries(
      HALLUCINATION_KINDS.map((kind) => {
        const audio = new Audio(HALLUCINATION_AUDIO[kind]);
        audio.preload = "auto";
        audio.volume = 0.58;
        return [kind, audio];
      }),
    ) as Record<HallucinationKind, HTMLAudioElement>;
    hallucinationAudioRefs.current = audioByKind;
    const unlockAudio = () => {
      for (const audio of Object.values(audioByKind)) {
        audio.muted = true;
        void audio
          .play()
          .then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = false;
          })
          .catch(() => {
            audio.muted = false;
          });
      }
    };
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlockAudio);
      window.removeEventListener("keydown", unlockAudio);
      for (const audio of Object.values(audioByKind)) {
        audio.pause();
      }
      hallucinationAudioRefs.current = {};
    };
  }, []);

  useEffect(() => {
    if (world.sanStage === "NORMAL") {
      setHallucinationFrame(0);
      return;
    }
    const timer = window.setInterval(() => {
      setHallucinationFrame((current) => (current + 1) % 4);
    }, 190);
    return () => window.clearInterval(timer);
  }, [world.sanStage]);

  useEffect(() => {
    if (world.sanStage === "NORMAL") return;
    let timer = 0;
    let disposed = false;
    const scheduleLaugh = () => {
      timer = window.setTimeout(() => {
        const visibleKinds = visibleHallucinationKindsRef.current;
        const audioPlaying = Object.values(
          hallucinationAudioRefs.current,
        ).some((audio) => audio && !audio.paused);
        const kind =
          visibleKinds[Math.floor(Math.random() * visibleKinds.length)];
        const audio = kind
          ? hallucinationAudioRefs.current[kind]
          : undefined;
        if (
          !disposed &&
          visibleKinds.length > 0 &&
          !audioPlaying &&
          audio?.paused &&
          Math.random() < 0.72
        ) {
          audio.currentTime = 0;
          void audio.play().catch(() => {
            // 浏览器尚未收到用户手势时保持静音，下一轮继续尝试。
          });
        }
        if (!disposed) scheduleLaugh();
      }, 4_500 + Math.random() * 6_500);
    };
    scheduleLaugh();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [world.sanStage]);

  useEffect(() => {
    setSequenceProgress({ nodeId: node.id, completedBeats: 0 });
  }, [node.id]);

  useEffect(() => {
    onPerformingChange?.(sequencePerforming);
    if (!node.sequence || sequenceState.complete) return;
    const timer = window.setTimeout(() => {
      setSequenceProgress((current) => ({
        nodeId: node.id,
        completedBeats:
          current.nodeId === node.id ? current.completedBeats + 1 : 1,
      }));
    }, currentBeatDuration);
    return () => window.clearTimeout(timer);
  }, [
    node.id,
    node.sequence,
    onPerformingChange,
    sequencePerforming,
    sequenceState.activeBeat?.id,
    currentBeatDuration,
    sequenceState.complete,
  ]);

  useEffect(() => {
    if (node.pose.HAO_GE !== "fall") {
      setFallFrame(node.pose.HAO_GE === "injured" ? 7 : 0);
      return;
    }
    setFallFrame(0);
    const timer = window.setInterval(() => {
      setFallFrame((current) => Math.min(7, current + 1));
    }, 125);
    return () => window.clearInterval(timer);
  }, [node.id, node.pose.HAO_GE]);

  const camera = useMemo(() => {
    const rawX = viewport.width / 2 - playerPixel.x;
    const rawY = viewport.height * 0.47 - playerPixel.y;
    // 底部对话框会覆盖视口下方约 35%，因此允许镜头略微越过
    // 地图南边界，让出口处的主角仍保持在对话框上方。
    const southCameraLimit =
      viewport.height * 0.47 - (WORLD_HEIGHT - TILE_HEIGHT / 2);
    return {
      x: Math.min(0, Math.max(viewport.width - WORLD_WIDTH, rawX)),
      y: Math.min(0, Math.max(southCameraLimit, rawY)),
    };
  }, [playerPixel.x, playerPixel.y, viewport.height, viewport.width]);

  const playerFrame = player.moving
    ? PLAYER_FRAMES[player.direction][player.frame % 8]
    : PLAYER_FRAMES[player.direction][0];
  const playerSequenceState = sequenceState.characters.HUAQIANG;
  const playerExpressionId =
    directorPresentation.actorExpressions.HUAQIANG ??
    playerSequenceState?.expression ??
    node.expressions.HUAQIANG ??
    STORY_CHARACTERS.HUAQIANG?.defaultExpression ??
    "idle";
  const playerExpression = getStoryExpression(
    "HUAQIANG",
    playerExpressionId,
  );
  const playerSprite =
    expressionSprite("HUAQIANG", playerExpressionId, player.direction) ??
    playerFrame;
  const activeSpeakerId =
    directorPresentation.speech?.actorId ?? node.speaker;
  const speakerCharacter = STORY_CHARACTERS[activeSpeakerId];
  const speakerGrid =
    activeSpeakerId === "HUAQIANG"
      ? player
      : directorPresentation.actorPositions[activeSpeakerId] ??
        sequenceState.characters[activeSpeakerId]?.position ??
        node.characterPositions[activeSpeakerId] ??
        speakerCharacter?.initialPosition;
  const speakerPixel = speakerGrid
    ? projectGridToPixel(speakerGrid)
    : undefined;
  const showDialogue =
    !player.moving &&
    (directorPresentation.speech
      ? Boolean(directorPresentation.speech.text)
      : Boolean(node.dialogue) &&
        (sequenceState.bubble ??
          (node.sequence ? false : node.speechBubble.visible)));
  const haoHoldsMelon =
    (node.id === "pick_melon" && completedBeats >= 1) ||
    (node.id === "weigh_melon" && completedBeats < 2);
  const playerHeldObject = Object.entries(directorObjects).find(
    ([, object]) =>
      object.anchor.type === "CHARACTER" &&
      object.anchor.targetId === "HUAQIANG",
  )?.[0];
  const instantPlayerSprite =
    playerHeldObject === "single_melon"
      ? `/assets/generated/sprites/huaqiang_hold_melon_${player.direction}.png`
      : playerHeldObject === "melon_knife"
        ? `/assets/generated/sprites/huaqiang_hold_knife_${player.direction}.png`
        : playerHeldObject === "hidden_magnet"
          ? `/assets/generated/sprites/huaqiang_show_magnet_${player.direction}.png`
          : sequenceState.props.single_melon?.state === "held-by-huaqiang"
            ? `/assets/generated/sprites/huaqiang_hold_melon_${player.direction}.png`
            : node.id === "cut_melon" && completedBeats < 2
              ? `/assets/generated/sprites/huaqiang_hold_knife_${player.direction}.png`
              : node.id === "reveal_magnet"
                ? `/assets/generated/sprites/huaqiang_show_magnet_${player.direction}.png`
                : playerSprite;
  const stoolOccupied = ambientEntities.some(
    (entity) =>
      entity.kind === "COOLING_OLDMAN" &&
      entity.phase === "RESTING",
  );
  const sanLevel =
    world.san >= 75
      ? "clear"
      : world.san >= 50
        ? "stable"
        : world.san >= 20
          ? "hallucination"
          : "anomaly";
  const sanLabel = {
    clear: "清醒",
    stable: "稳定",
    hallucination: "恍惚",
    anomaly: "失控",
  }[sanLevel];
  const anomalyTimestamp = world.now.getTime();
  const playerAnomalous = anomalyVisibleFor(
    "story-character-HUAQIANG",
    world.sanStage,
    anomalyTimestamp,
  );
  const playerHallucinationKind = playerAnomalous
    ? hallucinationKindFor(
        "story-character-HUAQIANG",
        anomalyTimestamp,
      )
    : undefined;
  const anomalousStoryCharacters = new Map(
    Object.keys(STORY_CHARACTERS)
      .filter(
        (characterId) =>
          characterId !== "HUAQIANG" &&
          anomalyVisibleFor(
            `story-character-${characterId}`,
            world.sanStage,
            anomalyTimestamp,
          ),
      )
      .map((characterId) => [
        characterId,
        hallucinationKindFor(
          `story-character-${characterId}`,
          anomalyTimestamp,
        ),
      ] as const),
  );
  const anomalousAmbientCharacters = new Map(
    ambientEntities
      .filter(
        (entity) =>
          entity.kind !== "DOG" &&
          anomalyVisibleFor(
            entity.id,
            world.sanStage,
            anomalyTimestamp,
          ),
      )
      .map((entity) => [
        entity.id,
        hallucinationKindFor(entity.id, anomalyTimestamp),
      ] as const),
  );
  visibleHallucinationKindsRef.current = Array.from(
    new Set([
      ...(playerHallucinationKind
        ? [playerHallucinationKind]
        : []),
      ...anomalousStoryCharacters.values(),
      ...anomalousAmbientCharacters.values(),
    ]),
  );

  return (
    <section
      ref={viewportRef}
      className="market-scene story-scene"
      data-day-phase={world.phase}
      data-san-stage={world.sanStage}
      aria-label="华强买瓜街口大场景"
    >
      <div
        className="story-world"
        style={{
          width: WORLD_WIDTH,
          height: WORLD_HEIGHT,
          transform: `translate3d(${camera.x}px, ${camera.y}px, 0)`,
        }}
      >
        <div className="scene-vignette" />
        <div className="world-lighting" aria-hidden="true" />
        <div className="iso-grid" aria-hidden="true">
          {ISO_TILES.map((tile) => {
            const position = projectGridToPixel(tile);
            return (
              <i
                key={`${tile.column}-${tile.row}`}
                style={{
                  left: position.x,
                  top: position.y,
                  width: TILE_WIDTH,
                  height: TILE_HEIGHT,
                }}
              />
            );
          })}
        </div>

        {MARKET_PROPS.map((prop) => {
          const legacyPropState =
            sequenceState.props[prop.id]?.state ?? "default";
          const runtimeObject = directorObjects[prop.id];
          const propState =
            prop.id === "short_stool_prop" && stoolOccupied
              ? "OCCUPIED"
              : legacyPropState !== "default"
                ? normalizeStoryPropState(prop.id, legacyPropState)
                : runtimeObject?.visualState ??
                  normalizeStoryPropState(prop.id, legacyPropState);
          const propSequencePosition =
            sequenceState.props[prop.id]?.position;
          const runtimeTargetProp =
            runtimeObject?.anchor.type === "PROP" &&
            runtimeObject.anchor.targetId
              ? MARKET_PROPS.find(
                  (candidate) =>
                    candidate.id === runtimeObject.anchor.targetId,
                )
              : undefined;
          const defaultRuntimePosition = {
            column: prop.origin.column,
            row: prop.origin.row + prop.footprint.rows - 1,
          };
          const runtimeWorldPosition =
            runtimeObject?.anchor.type === "WORLD" &&
            runtimeObject.anchor.gridPosition &&
            (runtimeObject.anchor.gridPosition.column !==
              defaultRuntimePosition.column ||
              runtimeObject.anchor.gridPosition.row !==
                defaultRuntimePosition.row)
              ? runtimeObject.anchor.gridPosition
              : undefined;
          const anchorPosition =
            propSequencePosition ?? runtimeWorldPosition;
          const anchor =
            propSequencePosition || runtimeWorldPosition
              ? projectGridToPixel(anchorPosition!)
              : runtimeTargetProp
                ? {
                    x:
                      (runtimeTargetProp.origin.column +
                        runtimeTargetProp.footprint.columns / 2) *
                      TILE_WIDTH,
                    y:
                      (runtimeTargetProp.origin.row +
                        runtimeTargetProp.footprint.rows) *
                      TILE_HEIGHT,
                  }
                : {
                    x:
                      (prop.origin.column + prop.footprint.columns / 2) *
                      TILE_WIDTH,
                    y:
                      (prop.origin.row + prop.footprint.rows) *
                      TILE_HEIGHT,
                  };
          const depthCell = {
            column:
              anchorPosition?.column ??
              runtimeTargetProp?.origin.column ??
              prop.origin.column,
            row:
              anchorPosition?.row ??
              (runtimeTargetProp
                ? runtimeTargetProp.origin.row +
                  runtimeTargetProp.footprint.rows -
                  1
                : undefined) ??
              prop.origin.row + prop.footprint.rows - 1,
          };
          return (
            <div
              key={prop.id}
              className={`market-prop prop-${prop.id}`}
              data-prop-id={prop.id}
              data-story-state={legacyPropState}
              data-visual-state={propState}
              style={{
                left: anchor.x,
                top: anchor.y,
                width: prop.visualSize.width,
                height: prop.visualSize.height,
                zIndex: gridDepth(depthCell),
                "--beat-duration": `${currentBeatDuration}ms`,
              } as CSSProperties}
              aria-label={prop.displayName}
            >
              {propState !== "HELD" &&
              runtimeObject?.anchor.type !== "CHARACTER" &&
              runtimeObject?.anchor.type !== "REMOVED" ? (
                <img
                  src={
                    prop.id === "single_melon" && propState === "CUT"
                      ? "/assets/generated/props/cut_melon_unripe.png"
                      : prop.asset
                  }
                  alt=""
                  draggable={false}
                />
              ) : null}
            </div>
          );
        })}

        {MARKET_VEGETATION.map((vegetation) => {
          const anomalous = Boolean(
            vegetation.anomalyAsset &&
            anomalyVisibleFor(
              vegetation.id,
              world.sanStage,
              anomalyTimestamp,
            ),
          );
          const screen = projectGridToPixel(vegetation.position);
          return (
            <div
              key={vegetation.id}
              className={[
                "scene-vegetation",
                `is-${vegetation.kind.toLowerCase()}`,
                anomalous ? `is-${world.sanStage.toLowerCase()}` : "",
              ].join(" ")}
              style={{
                left: screen.x,
                top: screen.y,
                width: vegetation.visualSize.width,
                height: vegetation.visualSize.height,
                zIndex: gridDepth(vegetation.position) + 2,
              }}
              aria-label={vegetation.displayName}
            >
              <img
                src={
                  anomalous
                    ? vegetation.anomalyAsset
                    : vegetation.asset
                }
                alt=""
                draggable={false}
              />
            </div>
          );
        })}

        {Object.entries(STORY_CHARACTERS)
          .filter(([id]) => id !== "HUAQIANG")
          .map(([id, character]) => {
          const sequenceCharacter = sequenceState.characters[id];
          const gridPosition =
            directorPresentation.actorPositions[id] ??
            sequenceCharacter?.position ??
            node.characterPositions[id] ??
            character.initialPosition;
          const screen = projectGridToPixel(gridPosition);
          const facing =
            directorPresentation.actorFacings[id] ??
            sequenceCharacter?.facing ??
            (playerPixel.x < screen.x ? "left" : "right");
          const expressionId =
            directorPresentation.actorExpressions[id] ??
            sequenceCharacter?.expression ??
            node.expressions[id] ??
            character.defaultExpression;
          const definition = getStoryExpression(id, expressionId);
          const pose = definition?.pose ?? "idle";
          const directorHeldObject = Object.entries(directorObjects).find(
            ([, object]) =>
              object.anchor.type === "CHARACTER" &&
              object.anchor.targetId === id,
          )?.[0];
          const normalSprite =
            id === "HAO_GE" &&
            (haoHoldsMelon || directorHeldObject === "single_melon")
              ? `/assets/generated/sprites/hao_hold_melon_${facing}.png`
              : id === "HAO_GE" && directorHeldObject === "melon_knife"
                ? `/assets/generated/sprites/hao_hold_knife_${facing}.png`
              :
            definition?.animation === "fall8"
              ? `/assets/generated/sprites/hao_fall_${fallFrame}.png`
              : expressionSprite(id, expressionId, facing);
          const hallucinationKind = anomalousStoryCharacters.get(id);
          const anomalous = Boolean(hallucinationKind);
          const sprite = anomalous
            ? hallucinationSprite(
                hallucinationKind!,
                facing,
                hallucinationFrameFor(
                  `story-character-${id}`,
                  hallucinationFrame,
                ),
              )
            : normalSprite;
          return (
            <div
              key={id}
              className={[
                "npc-entity",
                `npc-${id.toLowerCase()}`,
                `pose-${pose}`,
                `animation-${definition?.animation ?? "none"}`,
                `sequence-motion-${
                  directorPresentation.actorMoving[id] ||
                  sequenceCharacter?.motion === "walk"
                    ? "walk"
                    : "idle"
                }`,
                anomalous ? `is-${world.sanStage.toLowerCase()}` : "",
              ].join(" ")}
              data-expression={expressionId}
              data-facing={facing}
              data-hallucination={hallucinationKind}
              style={{
                left: screen.x,
                top: screen.y,
                zIndex: gridDepth(gridPosition),
                "--beat-duration": `${currentBeatDuration}ms`,
              } as CSSProperties}
            >
              {sprite ? (
                <img src={sprite} alt="" draggable={false} />
              ) : (
                <span className="npc-placeholder" aria-hidden="true">
                  {character.displayName.slice(0, 1)}
                </span>
              )}
              <span className="object-label">{character.displayName}</span>
            </div>
          );
        })}

        {ambientEntities.map((entity) => {
          const screen = projectGridToPixel(entity.position);
          const hallucinationKind =
            anomalousAmbientCharacters.get(entity.id);
          const anomalous = Boolean(hallucinationKind);
          const showEmoji = ambientEmojiVisible(
            entity,
            world.now.getTime(),
          );
          return (
            <div
              key={entity.id}
              className={[
                "ambient-entity",
                entity.kind === "DOG" ? "is-dog" : "",
                entity.moving ? "is-moving" : "is-idle",
                entity.kind === "COOLING_OLDMAN" &&
                entity.phase === "RESTING"
                  ? "is-resting"
                  : "",
                `phase-${entity.phase.toLowerCase()}`,
                anomalous ? `is-${world.sanStage.toLowerCase()}` : "",
              ].join(" ")}
              style={{
                left: screen.x,
                top: screen.y,
                zIndex: gridDepth(entity.position) + 1,
              }}
              data-facing={entity.direction}
              data-model={entity.model}
              data-phase={entity.phase}
              data-hallucination={hallucinationKind}
              aria-hidden="true"
            >
              {showEmoji ? (
                <span className="ambient-emoji">{entity.emoji}</span>
              ) : null}
              <img
                src={ambientSprite(
                  entity,
                  anomalous,
                  hallucinationFrame,
                  anomalyTimestamp,
                )}
                alt=""
                draggable={false}
              />
            </div>
          );
        })}

        <div
          className={[
            "player-sprite",
            `pose-${playerExpression?.pose ?? "idle"}`,
            `animation-${playerExpression?.animation ?? "breathe"}`,
            `sequence-motion-${playerSequenceState?.motion ?? "idle"}`,
            playerAnomalous ? `is-${world.sanStage.toLowerCase()}` : "",
          ].join(" ")}
          data-moving={player.moving}
          data-direction={player.direction}
          data-expression={playerExpressionId}
          data-hallucination={playerHallucinationKind}
          style={{
            left: playerPixel.x,
            top: playerPixel.y,
            zIndex: gridDepth(player) + 5,
          }}
          aria-label="华强"
        >
          <img
            src={
              playerAnomalous
                ? hallucinationSprite(
                    playerHallucinationKind!,
                    player.direction,
                    hallucinationFrameFor(
                      "story-character-HUAQIANG",
                      hallucinationFrame,
                    ),
                  )
                : instantPlayerSprite
            }
            alt=""
            draggable={false}
          />
          <span className="player-name">华强</span>
        </div>

        {showDialogue &&
          speakerGrid &&
          speakerPixel && (
            <div
              key={node.id}
              className="scene-speech-bubble"
              data-speaker={activeSpeakerId}
              style={{
                left: speakerPixel.x,
                top: speakerPixel.y - 96 - node.speechBubble.offsetY,
                maxWidth: node.speechBubble.maxWidth,
                zIndex: gridDepth(speakerGrid) + 80,
              }}
              role="status"
              aria-live="polite"
            >
              <strong>
                {directorPresentation.speech
                  ? speakerCharacter?.displayName ?? activeSpeakerId
                  : node.speakerName}
              </strong>
              <span>
                {directorPresentation.speech?.text ?? node.dialogue}
              </span>
            </div>
          )}

      </div>

      <div className="camera-reticle" aria-hidden="true" />
      <div
        className="world-clock"
        data-san-level={sanLevel}
        aria-label={`北京时间 ${world.beijingTimeLabel}，SAN值 ${world.san}，状态${sanLabel}`}
      >
        <span className="world-time">{world.beijingTimeLabel}</span>
        <div className="san-readout">
          <span>SAN</span>
          <strong>{world.san}</strong>
          <small>/100 · {sanLabel}</small>
          <i aria-hidden="true">
            <b style={{ width: `${world.san}%` }} />
          </i>
        </div>
      </div>
      <div className="scene-help">
        <span><b>自动行走</b> 选择决定目的地</span>
        <span><b>镜头跟随</b> 华强始终在视野中心</span>
      </div>
    </section>
  );
}
