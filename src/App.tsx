import { useCallback, useEffect, useRef, useState } from "react";
import { MarketScene } from "./components/MarketScene";
import { StoryPanel } from "./components/StoryPanel";
import { VoteResultOverlay } from "./components/VoteResultOverlay";
import { CommentaryOverlay } from "./components/CommentaryOverlay";
import {
  isWalkable,
  planPathToSafeDestination,
  type PlayerRuntimeState,
} from "./game/isometric";
import {
  ANOMALY_PLANT_POSITIONS,
  MARKET_PROPS,
  MARKET_VEGETATION,
  footprintCells,
} from "./game/sceneProps";
import { useAmbientWorld } from "./game/ambientWorld";
import {
  anomalyVisibleFor,
  useRealtimeWorld,
} from "./game/realtimeWorld";
import {
  MELON_STORY,
  STORY_CHARACTERS,
} from "./story/melonStory";
import {
  getStagePlacement,
  horizontalFacing,
} from "./story/stageLayout";
import {
  autoAdvanceStory,
  chooseStoryOption,
  createStoryRuntime,
} from "./story/storyEngine";
import { applySanInterference } from "./story/sanInterference";
import {
  executeDirectorInteraction,
  gateDirectorPlan,
  type DirectorCommand,
  type DirectorPlan,
} from "./story/director";
import {
  DirectorLockTable,
  EMPTY_DIRECTOR_PRESENTATION,
  runDirectorPlan,
  type DirectorPresentation,
} from "./story/directorExecutor";
import {
  createObjectRuntime,
  type ObjectRuntime,
} from "./game/objectRuntime";
import {
  buildAgentStoryContext,
  createAgentTargetId,
  createFallbackAgentNode,
  createProvisionalAudienceChoice,
  normalizeAgentChoice,
  normalizeAgentNode,
  type AudienceProposal,
} from "./story/agentStory";
import {
  canResolveStoryVote,
  createStoryVoteResult,
  nextVoteResultSecond,
  parseCustomChoiceSubmission,
  parseStoryVote,
  nextVotingSecond,
  STORY_VOTE_RESULT_SECONDS,
  STORY_VOTING_SECONDS,
  totalStoryVotes,
  type StoryVoteResult,
} from "./story/liveVoting";
import type {
  StoryChoice,
  StoryChoiceId,
  StoryNode,
} from "./story/types";
import type { BilibiliDanmakuEvent, LiveEventEnvelope } from "./shared/types";
import { useCommentary } from "./hooks/useCommentary";
import { useBackgroundMusic } from "./hooks/useBackgroundMusic";

const EMPTY_VOTES: Record<StoryChoiceId, number> = {
  A: 0,
  B: 0,
  C: 0,
};
const MARKET_PROP_BY_ID = Object.fromEntries(
  MARKET_PROPS.map((prop) => [prop.id, prop]),
);
const PLAYER_START = STORY_CHARACTERS.HUAQIANG!.initialPosition;
const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const createInitialDirectorObjects = (): Record<string, ObjectRuntime> => {
  const objects = Object.fromEntries(
    MARKET_PROPS.map((prop) => [
      prop.id,
      createObjectRuntime(prop.id, {
        column: prop.origin.column,
        row: prop.origin.row + prop.footprint.rows - 1,
      }),
    ]),
  );
  objects.hidden_magnet = createObjectRuntime(
    "hidden_magnet",
    { column: 18, row: 14 },
    { hiddenUnderScale: true },
  );
  objects.scale_weight = createObjectRuntime(
    "scale_weight",
    { column: 19, row: 14 },
  );
  objects.melon_knife = createObjectRuntime(
    "melon_knife",
    { column: 17, row: 16 },
  );
  return objects;
};

const inferDirectorTargetId = (choice: StoryChoice): string => {
  const visibleIntent = `${choice.label} ${choice.description}`;
  if (/价牌|标价|价格牌/.test(visibleIntent)) return "price_board";
  if (/秤|称|复验|重量|磁铁/.test(visibleIntent)) {
    return "hao_scale_prop";
  }
  if (/刀|切|半个/.test(visibleIntent)) return "cutting_table";
  if (/摩托|停车|骑车|离开|撤/.test(visibleIntent)) {
    return "black_motorcycle";
  }
  if (/凳|坐下/.test(visibleIntent)) return "short_stool_prop";
  if (/瓜|敲|拍一拍|拿起|抱起/.test(visibleIntent)) {
    return "single_melon";
  }
  if (/隔壁|邻摊|证人/.test(visibleIntent)) return "NEIGHBOR";
  if (/问|说|谈|商量|质问|郝哥|老板/.test(visibleIntent)) {
    return "HAO_GE";
  }
  if (/scale|weigh|magnet/.test(choice.next)) {
    return "hao_scale_prop";
  }
  if (/cut/.test(choice.next)) return "cutting_table";
  if (/leave|ride|bike|exit/.test(choice.next)) {
    return "black_motorcycle";
  }
  if (/neighbor|witness/.test(choice.next)) return "NEIGHBOR";
  if (/ask|bargain|guarantee/.test(choice.next)) return "HAO_GE";
  return "single_melon";
};

const runtimePropBlockers = (
  objects: Record<string, ObjectRuntime>,
): string[] =>
  MARKET_PROPS.filter((prop) => prop.blocksMovement).flatMap((prop) => {
    const runtime = objects[prop.id];
    if (
      runtime &&
      (runtime.anchor.type === "CHARACTER" ||
        runtime.anchor.type === "PROP" ||
        runtime.anchor.type === "REMOVED")
    ) {
      return [];
    }
    const defaultPosition = {
      column: prop.origin.column,
      row: prop.origin.row + prop.footprint.rows - 1,
    };
    const anchor = runtime?.anchor.gridPosition;
    if (
      !anchor ||
      (anchor.column === defaultPosition.column &&
        anchor.row === defaultPosition.row)
    ) {
      return footprintCells(prop).map(
        ({ column, row }) => `${column},${row}`,
      );
    }
    const movedOrigin = {
      column: anchor.column,
      row: anchor.row - prop.footprint.rows + 1,
    };
    return Array.from(
      { length: prop.footprint.columns * prop.footprint.rows },
      (_, index) => {
        const column =
          movedOrigin.column + (index % prop.footprint.columns);
        const row =
          movedOrigin.row +
          Math.floor(index / prop.footprint.columns);
        return `${column},${row}`;
      },
    );
  });

export function App() {
  const [story, setStory] = useState(createStoryRuntime);
  const [player, setPlayer] = useState<PlayerRuntimeState>({
    ...PLAYER_START,
    direction: "right",
    frame: 0,
    moving: false,
  });
  const [votes, setVotes] =
    useState<Record<StoryChoiceId, number>>(EMPTY_VOTES);
  const [moving, setMoving] = useState(false);
  const [scenePerforming, setScenePerforming] = useState(false);
  const [remainingSeconds, setRemainingSeconds] =
    useState(STORY_VOTING_SECONDS);
  const [voteResult, setVoteResult] = useState<StoryVoteResult | null>(null);
  const [resultSeconds, setResultSeconds] =
    useState(STORY_VOTE_RESULT_SECONDS);
  const [preparedVoteNodeId, setPreparedVoteNodeId] = useState(story.nodeId);
  const [liveState, setLiveState] = useState("connecting");
  const [dynamicNodes, setDynamicNodes] = useState<
    Record<string, StoryNode>
  >({});
  const [agentChoices, setAgentChoices] = useState<
    Record<string, StoryChoice[]>
  >({});
  const [audienceChoices, setAudienceChoices] = useState<
    Record<string, Partial<Record<StoryChoiceId, StoryChoice>>>
  >({});
  const [audienceProposals, setAudienceProposals] = useState<
    Record<
      string,
      Partial<Record<StoryChoiceId, AudienceProposal[]>>
    >
  >({});
  const [agentLoadingNodeId, setAgentLoadingNodeId] =
    useState<string | null>(null);
  const [directorExecuting, setDirectorExecuting] = useState(false);
  const [directorPresentation, setDirectorPresentation] =
    useState<DirectorPresentation>(EMPTY_DIRECTOR_PRESENTATION);
  const [directorObjects, setDirectorObjects] = useState<
    Record<string, ObjectRuntime>
  >(createInitialDirectorObjects);
  const commentary = useCommentary();
  const backgroundMusic = useBackgroundMusic({
    ducked: commentary.isSpeaking && !commentary.muted,
  });
  const storyRef = useRef(story);
  const playerRef = useRef(player);
  const nodeRef = useRef<StoryNode>(MELON_STORY[story.nodeId]!);
  const dynamicNodesRef = useRef(dynamicNodes);
  const movementToken = useRef(0);
  const seenMessages = useRef(new Set<string>());
  const viewerVotes = useRef(new Map<string, StoryChoiceId>());
  const votingOpenRef = useRef(false);
  const resolvingVote = useRef(false);
  const ambientRef = useRef<ReturnType<typeof useAmbientWorld>>([]);
  const worldBlockersRef = useRef<ReadonlySet<string>>(new Set());
  const directorPlanRef = useRef<DirectorPlan | null>(null);
  const directorExecutingRef = useRef(false);
  const directorPresentationRef = useRef(directorPresentation);
  const directorObjectsRef = useRef(directorObjects);
  const directorLocksRef = useRef(new DirectorLockTable());
  const directorAbortRef = useRef<AbortController | null>(null);
  const directorPlanRequestRef = useRef<Promise<void> | null>(null);
  const requestedContinuationNodes = useRef(new Set<string>());
  const recentDirectorPlansRef = useRef<
    Array<{
      nodeId: string;
      choiceLabel: string;
      worldRevision: number;
      beats: DirectorPlan["beats"];
    }>
  >([]);
  const targetGenerationRequests = useRef(
    new Map<string, Promise<StoryNode>>(),
  );
  storyRef.current = story;
  playerRef.current = player;
  dynamicNodesRef.current = dynamicNodes;
  directorExecutingRef.current = directorExecuting;
  directorPresentationRef.current = directorPresentation;
  directorObjectsRef.current = directorObjects;
  const resolveStoryNode = useCallback(
    (nodeId: string) =>
      dynamicNodesRef.current[nodeId] ?? MELON_STORY[nodeId],
    [],
  );

  const world = useRealtimeWorld(story.san);
  const baseNode = dynamicNodes[story.nodeId] ?? MELON_STORY[story.nodeId]!;
  const baseChoices = agentChoices[story.nodeId] ?? baseNode.choices;
  const audienceChoiceSlots = audienceChoices[story.nodeId] ?? {};
  const nodeChoices = baseChoices.map(
    (choice) => audienceChoiceSlots[choice.id] ?? choice,
  );
  const node = applySanInterference(
    {
      ...baseNode,
      choices: nodeChoices,
      ending: nodeChoices.length > 0 ? undefined : baseNode.ending,
    },
    world.sanStage,
    story.route.length,
  );
  nodeRef.current = node;
  const activePlantBlockers =
    world.sanStage === "ANOMALY"
      ? ANOMALY_PLANT_POSITIONS.filter((_, index) =>
          anomalyVisibleFor(
            `plant-${index}`,
            world.sanStage,
            world.now.getTime(),
          ),
        ).map(({ column, row }) => `${column},${row}`)
      : [];
  const vegetationBlockers = MARKET_VEGETATION.filter(
    (vegetation) => vegetation.blocksMovement,
  ).map(
    ({ position }) => `${position.column},${position.row}`,
  );
  const storyActorBlockers = Object.entries(STORY_CHARACTERS)
    .filter(([actorId]) => actorId !== "HUAQIANG")
    .map(
      ([actorId, character]) =>
        directorPresentation.actorPositions[actorId] ??
        node.characterPositions[actorId] ??
        character.initialPosition,
    )
    .map(({ column, row }) => `${column},${row}`);
  const worldBlockers = new Set([
    ...runtimePropBlockers(directorObjects),
    ...vegetationBlockers,
    ...storyActorBlockers,
    ...activePlantBlockers,
  ]);
  worldBlockersRef.current = worldBlockers;
  const ambientEntities = useAmbientWorld({
    player,
    blocked: worldBlockers,
    phase: world.phase,
    sanStage: world.sanStage,
  });
  ambientRef.current = ambientEntities;
  const canResolveVote = canResolveStoryVote({
    currentNodeId: node.id,
    preparedNodeId: preparedVoteNodeId,
    choiceCount: node.choices.length,
    moving,
    performing: scenePerforming || directorExecuting,
    hasResult: voteResult !== null,
    hasSelectedChoice: story.selectedChoice !== null,
  });
  const votingOpen = canResolveVote && remainingSeconds > 0;
  votingOpenRef.current = votingOpen;

  useEffect(() => {
    if (moving) return;
    const timer = window.setInterval(() => {
      setPlayer((current) =>
        current.moving
          ? current
          : { ...current, frame: (current.frame + 1) % 4 },
      );
    }, 380);
    return () => window.clearInterval(timer);
  }, [moving]);

  const castViewerVote = useCallback(
    (message: string, messageId: string, viewerId: string) => {
      if (seenMessages.current.has(messageId)) return;
      seenMessages.current.add(messageId);
      if (!votingOpenRef.current) return;

      const submission = parseCustomChoiceSubmission(message);
      const currentNode = nodeRef.current;
      if (submission) {
        const provisional = createProvisionalAudienceChoice(
          currentNode.id,
          storyRef.current.route.length,
          submission.choiceId,
          submission.text,
        );
        setAudienceChoices((current) => ({
          ...current,
          [currentNode.id]: {
            ...current[currentNode.id],
            [submission.choiceId]: provisional,
          },
        }));
        setAudienceProposals((current) => {
          const slots = current[currentNode.id] ?? {};
          const previous = slots[submission.choiceId] ?? [];
          const next = [
            ...previous.filter((proposal) => proposal.viewerId !== viewerId),
            { viewerId, text: submission.text },
          ].slice(-60);
          return {
            ...current,
            [currentNode.id]: {
              ...slots,
              [submission.choiceId]: next,
            },
          };
        });
      }

      const choice = submission?.choiceId ?? parseStoryVote(message);
      if (!choice) return;
      const previous = viewerVotes.current.get(viewerId);
      viewerVotes.current.set(viewerId, choice);
      setVotes((current) => ({
        ...current,
        ...(previous
          ? { [previous]: Math.max(0, current[previous] - 1) }
          : {}),
        [choice]: current[choice] + (previous === choice ? 0 : 1),
      }));
    },
    [],
  );

  useEffect(() => {
    const proposalSlots = audienceProposals[node.id] ?? {};
    const currentChoices = audienceChoices[node.id] ?? {};
    const activeSlots = (["A", "B", "C"] as const).filter(
      (choiceId) =>
        (proposalSlots[choiceId]?.length ?? 0) > 0 &&
        currentChoices[choiceId],
    );
    if (activeSlots.length === 0) return;

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      await Promise.all(
        activeSlots.map(async (choiceId) => {
          const currentChoice = currentChoices[choiceId]!;
          try {
            const response = await fetch("/api/story/custom-choice", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: controller.signal,
              body: JSON.stringify({
                context: {
                  ...buildAgentStoryContext(
                    storyRef.current,
                    nodeRef.current,
                    resolveStoryNode,
                  ),
                  choiceId,
                  nextNodeId: currentChoice.next,
                  allowedObjectIds: [
                    ...MARKET_PROPS.map((prop) => prop.id),
                    "hidden_magnet",
                    "scale_weight",
                    "melon_knife",
                  ],
                },
                proposals: proposalSlots[choiceId],
              }),
            });
            if (!response.ok) return;
            const payload = (await response.json()) as {
              choice?: Partial<StoryChoice>;
            };
            const consolidated = normalizeAgentChoice(
              payload.choice,
              choiceId,
              currentChoice.next,
              currentChoice.label,
            );
            setAudienceChoices((current) => ({
              ...current,
              [node.id]: {
                ...current[node.id],
                [choiceId]: consolidated,
              },
            }));
          } catch (error) {
            if ((error as Error).name !== "AbortError") {
              // 临时保留即时显示的弹幕原文，下一条提案会再次尝试归纳。
            }
          }
        }),
      );
    }, 700);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [audienceProposals, node.id]);

  useEffect(() => {
    if (
      baseNode.autoAdvanceTo ||
      baseNode.choices.length > 0 ||
      agentChoices[baseNode.id] ||
      requestedContinuationNodes.current.has(baseNode.id)
    ) {
      return;
    }

    requestedContinuationNodes.current.add(baseNode.id);
    setAgentLoadingNodeId(baseNode.id);
    const revision = storyRef.current.route.length;
    const nextNodeIds = Object.fromEntries(
      (["A", "B", "C"] as const).map((id) => [
        id,
        createAgentTargetId(baseNode.id, revision, id),
      ]),
    ) as Record<"A" | "B" | "C", string>;

    void (async () => {
      let choices: StoryChoice[];
      try {
        const response = await fetch("/api/story/continuation/options", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: {
              ...buildAgentStoryContext(
                storyRef.current,
                baseNode,
                resolveStoryNode,
              ),
              nextNodeIds,
              allowedObjectIds: [
                ...MARKET_PROPS.map((prop) => prop.id),
                "hidden_magnet",
                "scale_weight",
                "melon_knife",
              ],
            },
          }),
        });
        if (!response.ok) throw new Error("Agent 续写选项请求失败");
        const payload = (await response.json()) as {
          choices?: Partial<StoryChoice>[];
        };
        choices = (["A", "B", "C"] as const).map((id, index) =>
          normalizeAgentChoice(
            payload.choices?.find((choice) => choice.id === id) ??
              payload.choices?.[index],
            id,
            nextNodeIds[id],
            ["继续追问", "检查周围", "暂时缓和"][index]!,
          ),
        );
      } catch {
        const fallbackLabels = ["继续追问", "检查周围", "暂时缓和"];
        choices = (["A", "B", "C"] as const).map((id, index) =>
          normalizeAgentChoice(
            {
              label: fallbackLabels[index],
              description: "沿当前局势继续推进这条世界线。",
              tensionDelta: index === 0 ? 3 : index === 2 ? -2 : 0,
            },
            id,
            nextNodeIds[id],
            fallbackLabels[index]!,
          ),
        );
      }
      setAgentChoices((current) => ({
        ...current,
        [baseNode.id]: choices,
      }));
      setAgentLoadingNodeId((current) =>
        current === baseNode.id ? null : current,
      );
    })();
  }, [agentChoices, baseNode]);

  const ensureChoiceTarget = useCallback(
    async (
      currentNode: StoryNode,
      choice: StoryChoice,
    ): Promise<StoryNode> => {
      const existing =
        dynamicNodesRef.current[choice.next] ?? MELON_STORY[choice.next];
      if (existing) return existing;
      const pending = targetGenerationRequests.current.get(choice.next);
      if (pending) return pending;

      const request = (async () => {
        let nextNode = createFallbackAgentNode(
          choice.next,
          currentNode,
          choice,
        );
        try {
          const response = await fetch("/api/story/continuation/node", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              context: {
                ...buildAgentStoryContext(
                  storyRef.current,
                  currentNode,
                  resolveStoryNode,
                ),
                targetNodeId: choice.next,
                winningChoice: choice,
                allowedObjectIds: [
                  ...MARKET_PROPS.map((prop) => prop.id),
                  "hidden_magnet",
                  "scale_weight",
                  "melon_knife",
                ],
              },
            }),
          });
          if (response.ok) {
            const payload = (await response.json()) as {
              node?: Partial<StoryNode>;
            };
            nextNode = normalizeAgentNode(
              payload.node,
              choice.next,
              currentNode,
              choice,
            );
          }
        } catch {
          // 网络短暂中断时使用本地节点，保证胜出的世界线仍可继续。
        }
        dynamicNodesRef.current = {
          ...dynamicNodesRef.current,
          [choice.next]: nextNode,
        };
        setDynamicNodes(dynamicNodesRef.current);
        return nextNode;
      })();
      targetGenerationRequests.current.set(choice.next, request);
      try {
        return await request;
      } finally {
        targetGenerationRequests.current.delete(choice.next);
      }
    },
    [],
  );

  const updateDirectorPresentation = useCallback(
    (
      updater: (
        current: DirectorPresentation,
      ) => DirectorPresentation,
    ) => {
      const next = updater(directorPresentationRef.current);
      directorPresentationRef.current = next;
      setDirectorPresentation(next);
    },
    [],
  );

  const commitDirectorObjects = useCallback(
    (objects: Record<string, ObjectRuntime>) => {
      directorObjectsRef.current = objects;
      setDirectorObjects(objects);
    },
    [],
  );

  const directorActorPosition = useCallback(
    (actorId: string) => {
      if (actorId === "HUAQIANG") return playerRef.current;
      return (
        directorPresentationRef.current.actorPositions[actorId] ??
        nodeRef.current.characterPositions[actorId] ??
        STORY_CHARACTERS[actorId]?.initialPosition
      );
    },
    [],
  );

  const directorObjectPosition = useCallback(
    (
      objectId: string,
      visited: Set<string> = new Set(),
    ): { column: number; row: number } | undefined => {
      if (visited.has(objectId)) return undefined;
      visited.add(objectId);
      const object = directorObjectsRef.current[objectId];
      if (object?.anchor.gridPosition) return object.anchor.gridPosition;
      if (
        object?.anchor.type === "CHARACTER" &&
        object.anchor.targetId
      ) {
        return directorActorPosition(object.anchor.targetId);
      }
      if (object?.anchor.type === "PROP" && object.anchor.targetId) {
        return directorObjectPosition(object.anchor.targetId, visited);
      }
      const prop = MARKET_PROP_BY_ID[objectId];
      return prop
        ? {
            column: prop.origin.column,
            row: prop.origin.row + prop.footprint.rows - 1,
          }
        : undefined;
    },
    [directorActorPosition],
  );

  const directorTargetPosition = useCallback(
    (targetId: string | undefined) =>
      targetId
        ? directorActorPosition(targetId) ??
          directorObjectPosition(targetId)
        : undefined,
    [directorActorPosition, directorObjectPosition],
  );

  const moveDirectorActor = useCallback(
    async (
      command: Extract<DirectorCommand, { command: "MOVE_TO" }>,
    ): Promise<boolean> => {
      const current = directorActorPosition(command.actorId);
      if (!current) return false;
      const requested =
        command.destination === "nearest_interaction_cell"
          ? directorTargetPosition(command.targetId)
          : command.destination;
      if (!requested) return false;

      const blocked = new Set([
        ...worldBlockersRef.current,
        ...ambientRef.current
          .filter((entity) => entity.kind !== "DOG")
          .map(
            (entity) =>
              `${entity.position.column},${entity.position.row}`,
          ),
        ...Object.keys(STORY_CHARACTERS)
          .filter((actorId) => actorId !== command.actorId)
          .map(directorActorPosition)
          .filter(
            (
              position,
            ): position is { column: number; row: number } =>
              Boolean(position),
          )
          .map(
            (position) => `${position.column},${position.row}`,
          ),
      ]);
      blocked.delete(`${current.column},${current.row}`);
      const plan = planPathToSafeDestination(
        {
          ...current,
          direction:
            directorPresentationRef.current.actorFacings[
              command.actorId
            ] ?? "right",
          frame: 0,
          moving: false,
        },
        requested,
        blocked,
      );
      if (!plan) return false;

      if (command.actorId === "HUAQIANG") setMoving(true);
      updateDirectorPresentation((presentation) => ({
        ...presentation,
        actorMoving: {
          ...presentation.actorMoving,
          [command.actorId]: true,
        },
      }));
      for (const step of plan.path) {
        if (directorAbortRef.current?.signal.aborted) return false;
        let occupied = false;
        for (let attempt = 0; attempt < 8; attempt += 1) {
          occupied = ambientRef.current.some(
            (entity) =>
              entity.kind !== "DOG" &&
              entity.position.column === step.column &&
              entity.position.row === step.row,
          );
          if (!occupied) break;
          await wait(100);
        }
        if (occupied) return false;
        const previous = directorActorPosition(command.actorId) ?? current;
        const direction =
          step.column < previous.column
            ? "left"
            : step.column > previous.column
              ? "right"
              : directorPresentationRef.current.actorFacings[
                    command.actorId
                  ] ?? "right";
        if (command.actorId === "HUAQIANG") {
          const next: PlayerRuntimeState = {
            ...step,
            direction,
            moving: true,
            frame: (playerRef.current.frame + 1) % 8,
          };
          playerRef.current = next;
          setPlayer(next);
        } else {
          updateDirectorPresentation((presentation) => ({
            ...presentation,
            actorPositions: {
              ...presentation.actorPositions,
              [command.actorId]: step,
            },
            actorFacings: {
              ...presentation.actorFacings,
              [command.actorId]: direction,
            },
          }));
        }
        await wait(96);
      }

      const facePosition = command.faceTarget
        ? directorTargetPosition(command.targetId)
        : undefined;
      const settled = directorActorPosition(command.actorId) ?? current;
      const direction = horizontalFacing(
        settled,
        facePosition,
        directorPresentationRef.current.actorFacings[
          command.actorId
        ] ?? "right",
      );
      if (command.actorId === "HUAQIANG") {
        const next: PlayerRuntimeState = {
          ...playerRef.current,
          direction,
          moving: false,
          frame: 0,
        };
        playerRef.current = next;
        setPlayer(next);
        setMoving(false);
      } else {
        updateDirectorPresentation((presentation) => ({
          ...presentation,
          actorFacings: {
            ...presentation.actorFacings,
            [command.actorId]: direction,
          },
        }));
      }
      updateDirectorPresentation((presentation) => ({
        ...presentation,
        actorMoving: {
          ...presentation.actorMoving,
          [command.actorId]: false,
        },
      }));
      return true;
    },
    [
      directorActorPosition,
      directorTargetPosition,
      updateDirectorPresentation,
    ],
  );

  const faceDirectorActor = useCallback(
    (
      command: Extract<DirectorCommand, { command: "FACE" }>,
    ): boolean => {
      const actor = directorActorPosition(command.actorId);
      const target = directorTargetPosition(command.targetId);
      if (!actor || !target) return false;
      const fallback =
        command.actorId === "HUAQIANG"
          ? playerRef.current.direction
          : directorPresentationRef.current.actorFacings[
              command.actorId
            ] ?? "right";
      const direction = horizontalFacing(actor, target, fallback);
      if (command.actorId === "HUAQIANG") {
        const next = { ...playerRef.current, direction };
        playerRef.current = next;
        setPlayer(next);
      } else {
        updateDirectorPresentation((presentation) => ({
          ...presentation,
          actorFacings: {
            ...presentation.actorFacings,
            [command.actorId]: direction,
          },
        }));
      }
      return true;
    },
    [
      directorActorPosition,
      directorTargetPosition,
      updateDirectorPresentation,
    ],
  );

  const emoteDirectorActor = useCallback(
    (
      command: Extract<DirectorCommand, { command: "EMOTE" }>,
    ): boolean => {
      if (!STORY_CHARACTERS[command.actorId]?.expressions[command.expression]) {
        return false;
      }
      updateDirectorPresentation((presentation) => ({
        ...presentation,
        actorExpressions: {
          ...presentation.actorExpressions,
          [command.actorId]: command.expression,
        },
      }));
      return true;
    },
    [updateDirectorPresentation],
  );

  const speakDirectorLine = useCallback(
    async (
      command: Extract<DirectorCommand, { command: "SPEAK" }>,
    ): Promise<boolean> => {
      if (!STORY_CHARACTERS[command.actorId] || !command.text.trim()) {
        return false;
      }
      const requestedExpression =
        command.expression &&
        STORY_CHARACTERS[command.actorId]?.expressions[command.expression]
          ? command.expression
          : STORY_CHARACTERS[command.actorId]?.expressions.talk
            ? "talk"
            : undefined;
      updateDirectorPresentation((presentation) => ({
        ...presentation,
        speech: {
          actorId: command.actorId,
          text: command.text.slice(0, 40),
        },
        actorExpressions: requestedExpression
          ? {
              ...presentation.actorExpressions,
              [command.actorId]: requestedExpression,
            }
          : presentation.actorExpressions,
      }));
      await wait(
        Math.max(1_500, Math.min(4_200, command.text.length * 115)),
      );
      updateDirectorPresentation((presentation) => ({
        ...presentation,
        speech: undefined,
      }));
      return true;
    },
    [updateDirectorPresentation],
  );

  const interactDirectorObject = useCallback(
    (
      command: Extract<DirectorCommand, { command: "INTERACT" }>,
    ): boolean => {
      if (!command.interaction) return false;
      const actor = directorActorPosition(command.actorId);
      const target = directorObjectPosition(command.targetId);
      if (
        actor &&
        target &&
        Math.abs(actor.column - target.column) +
          Math.abs(actor.row - target.row) >
          1
      ) {
        return false;
      }
      if (
        command.interaction.actorId !== command.actorId ||
        !directorObjectsRef.current[command.interaction.objectId]
      ) {
        return false;
      }
      if (
        "targetId" in command.interaction &&
        !directorObjectsRef.current[command.interaction.targetId]
      ) {
        return false;
      }
      if (
        command.interaction.action === "DROP" &&
        !isWalkable(
          command.interaction.gridPosition,
          undefined,
          worldBlockersRef.current,
        )
      ) {
        return false;
      }
      const result = executeDirectorInteraction(
        command,
        directorObjectsRef.current,
      );
      if (!result.ok) return false;
      commitDirectorObjects(result.objects);
      return true;
    },
    [
      commitDirectorObjects,
      directorActorPosition,
      directorObjectPosition,
    ],
  );

  const executePreparedDirectorPlan = useCallback(
    async (
      currentNode: StoryNode,
      choiceId: StoryChoiceId,
    ): Promise<boolean> => {
      const plan = directorPlanRef.current;
      if (
        !plan ||
        plan.nodeId !== currentNode.id ||
        plan.winningChoiceId !== choiceId
      ) {
        return false;
      }
      const actorPositions = Object.fromEntries(
        Object.keys(STORY_CHARACTERS)
          .map((actorId) => [
            actorId,
            directorActorPosition(actorId),
          ])
          .filter((entry) => Boolean(entry[1])),
      ) as Record<string, { column: number; row: number }>;
      const gate = gateDirectorPlan(plan, {
        revision: storyRef.current.route.length,
        actorPositions,
        objects: directorObjectsRef.current,
        allowedActorIds: Object.keys(STORY_CHARACTERS),
        allowedObjectIds: Object.keys(directorObjectsRef.current),
        allowedExpressions: Object.fromEntries(
          Object.entries(STORY_CHARACTERS).map(([id, character]) => [
            id,
            Object.keys(character.expressions),
          ]),
        ),
      });
      if (!gate.ok) return false;
      if (
        !directorLocksRef.current.acquire(
          plan.planId,
          plan.requiredLocks,
        )
      ) {
        return false;
      }

      movementToken.current += 1;
      const controller = new AbortController();
      directorAbortRef.current = controller;
      directorExecutingRef.current = true;
      setDirectorExecuting(true);
      updateDirectorPresentation((presentation) => ({
        ...presentation,
        active: true,
      }));
      try {
        const result = await runDirectorPlan(
          plan,
          {
            moveTo: moveDirectorActor,
            face: faceDirectorActor,
            emote: emoteDirectorActor,
            speak: speakDirectorLine,
            interact: interactDirectorObject,
            wait,
            onBeatStart: (beat) => {
              updateDirectorPresentation((presentation) => ({
                ...presentation,
                beatLabel: beat.label,
              }));
            },
            applyBeatDeltas: (beat) => {
              if (!beat.sanDelta && !beat.tensionDelta) return;
              setStory((current) => ({
                ...current,
                san: Math.max(
                  0,
                  Math.min(100, current.san + (beat.sanDelta ?? 0)),
                ),
                tension: Math.max(
                  0,
                  Math.min(
                    100,
                    current.tension + (beat.tensionDelta ?? 0),
                  ),
                ),
              }));
            },
          },
          controller.signal,
        );
        if (result.ok) {
          const choiceLabel =
            currentNode.choices.find((choice) => choice.id === choiceId)
              ?.label ?? choiceId;
          recentDirectorPlansRef.current = [
            ...recentDirectorPlansRef.current,
            {
              nodeId: currentNode.id,
              choiceLabel,
              worldRevision: storyRef.current.route.length,
              beats: plan.beats,
            },
          ].slice(-6);
        }
        return result.ok;
      } finally {
        directorLocksRef.current.release(plan.planId);
        directorAbortRef.current = null;
        directorExecutingRef.current = false;
        setDirectorExecuting(false);
        setMoving(false);
        const settledPlayer: PlayerRuntimeState = {
          ...playerRef.current,
          moving: false,
          frame: 0,
        };
        playerRef.current = settledPlayer;
        setPlayer(settledPlayer);
        updateDirectorPresentation((presentation) => ({
          ...presentation,
          active: false,
          beatLabel: undefined,
          speech: undefined,
          actorMoving: {},
        }));
      }
    },
    [
      directorActorPosition,
      emoteDirectorActor,
      faceDirectorActor,
      interactDirectorObject,
      moveDirectorActor,
      speakDirectorLine,
      updateDirectorPresentation,
    ],
  );

  const prepareDirectorPlan = useCallback(
    async (result: StoryVoteResult) => {
      const currentNode = nodeRef.current;
      const choice = currentNode.choices.find(
        (candidate) => candidate.id === result.winner,
      );
      if (!choice) return;
      const nextNode =
        dynamicNodesRef.current[choice.next] ?? MELON_STORY[choice.next];
      const targetId = inferDirectorTargetId(choice);
      const interactionTargetId = directorObjectsRef.current[targetId]
        ? targetId
        : "single_melon";
      try {
        const response = await fetch("/api/director/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            context: {
              nodeId: currentNode.id,
              winningChoiceId: result.winner,
              worldRevision: storyRef.current.route.length,
              actorId: "HUAQIANG",
              targetId,
              winningChoice: {
                id: choice.id,
                label: choice.label,
                description: choice.description,
                next: choice.next,
              },
              fallbackNodeId: choice.next,
              fallbackLine:
                nextNode?.dialogue ??
                nextNode?.narration.slice(0, 40) ??
                choice.description.slice(0, 40),
              allowedActorIds: Object.keys(STORY_CHARACTERS),
              allowedObjectIds: [
                ...MARKET_PROPS.map((prop) => prop.id),
                "hidden_magnet",
                "scale_weight",
                "melon_knife",
              ],
              allowedExpressions: Object.fromEntries(
                Object.entries(STORY_CHARACTERS).map(([id, character]) => [
                  id,
                  Object.keys(character.expressions),
                ]),
              ),
              actorPositions: Object.fromEntries(
                Object.keys(STORY_CHARACTERS).map((actorId) => [
                  actorId,
                  directorActorPosition(actorId),
                ]),
              ),
              objectSnapshot: directorObjectsRef.current,
              recentStory: storyRef.current.route.slice(-6).flatMap(
                (nodeId) => {
                  const recentNode = resolveStoryNode(nodeId);
                  return recentNode
                    ? [
                        {
                          nodeId: recentNode.id,
                          narration: recentNode.narration,
                          dialogue: recentNode.dialogue ?? "",
                          stageDirection: recentNode.stageDirection,
                        },
                      ]
                    : [];
                },
              ),
              recentDirectorPlans: recentDirectorPlansRef.current,
              interactionSchema: {
                PICK_UP: {
                  action: "PICK_UP",
                  actorId: "HUAQIANG",
                  objectId: interactionTargetId,
                  socket: "BOTH_HANDS",
                },
                PLACE: {
                  action: "PLACE",
                  actorId: "HUAQIANG",
                  objectId: "single_melon",
                  targetId: interactionTargetId,
                },
                CUT: {
                  action: "CUT",
                  actorId: "HUAQIANG",
                  objectId: "single_melon",
                  targetId: "cutting_table",
                },
              },
            },
          }),
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          plan?: DirectorPlan;
        };
        if (
          payload.plan?.winningChoiceId === result.winner &&
          payload.plan.nodeId === currentNode.id
        ) {
          directorPlanRef.current = payload.plan;
        }
      } catch {
        // Agent 不可用时继续使用 JSON 剧情骨架，不阻塞投票流程。
      }
    },
    [directorActorPosition, resolveStoryNode],
  );

  useEffect(() => {
    const events = new EventSource("/api/live/events");
    events.onmessage = (event) => {
      try {
        const envelope = JSON.parse(event.data) as LiveEventEnvelope;
        if (envelope.type === "status") {
          const status = envelope.payload as { state?: string };
          setLiveState(status.state ?? "unknown");
          return;
        }
        if (envelope.type === "system") {
          const system = envelope.payload as { level?: string };
          if (system.level === "error") setLiveState("error");
          return;
        }
        const command = envelope.payload as Partial<BilibiliDanmakuEvent>;
        if (
          envelope.type === "bilibili" &&
          command.cmd === "LIVE_OPEN_PLATFORM_DM" &&
          command.data?.msg &&
          command.data.msg_id
        ) {
          castViewerVote(
            command.data.msg,
            command.data.msg_id,
            command.data.open_id,
          );
        }
      } catch {
        // 外部直播消息格式不可信，解析失败时忽略。
      }
    };
    events.onerror = () => setLiveState("offline");
    return () => events.close();
  }, [castViewerVote]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch("/api/commentary/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          state: {
            nodeId: node.id,
            chapter: node.chapter,
            speakerName: node.speakerName,
            narration: node.narration,
            dialogue: node.dialogue ?? "",
            stageDirection: node.stageDirection,
            choices: node.choices.map((choice) => ({
              id: choice.id,
              label: choice.label,
              description: choice.description,
            })),
            votes,
            remainingSeconds,
            votingOpen,
            voteResult,
            san: story.san,
            tension: story.tension,
            routeLength: story.route.length,
            recentRoute: story.route.slice(-5),
            player: {
              column: player.column,
              row: player.row,
              moving: player.moving || moving,
            },
            world: {
              phase: world.phase,
              beijingTime: world.beijingTimeLabel,
              sanStage: world.sanStage,
            },
            performance: {
              scenePerforming,
              directorExecuting,
              beatLabel: directorPresentation.beatLabel ?? "",
            },
            liveState,
            ambientNpcCount: ambientEntities.length,
          },
        }),
      }).catch(() => undefined);
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [
    ambientEntities.length,
    directorExecuting,
    directorPresentation.beatLabel,
    liveState,
    moving,
    node.chapter,
    node.dialogue,
    node.id,
    node.narration,
    node.choices,
    node.speakerName,
    node.stageDirection,
    player.column,
    player.moving,
    player.row,
    remainingSeconds,
    scenePerforming,
    story.route,
    story.san,
    story.tension,
    voteResult,
    votes,
    votingOpen,
    world.beijingTimeLabel,
    world.phase,
    world.sanStage,
  ]);

  useEffect(() => {
    if (!node.autoAdvanceTo) return;
    const timer = window.setTimeout(() => {
      setStory((current) => autoAdvanceStory(current, node));
    }, node.autoAdvanceMs ?? 1000);
    return () => window.clearTimeout(timer);
  }, [node.autoAdvanceMs, node.autoAdvanceTo, node.id]);

  const choose = useCallback(async (choiceId: StoryChoiceId) => {
    if (moving || scenePerforming || directorExecutingRef.current) return;
    const currentNode = nodeRef.current;
    const choice = currentNode.choices.find((item) => item.id === choiceId);
    if (!choice) return;
    setStory((current) => ({ ...current, selectedChoice: choiceId }));
    await directorPlanRequestRef.current;
    await executePreparedDirectorPlan(currentNode, choiceId);
    const nextNode = await ensureChoiceTarget(currentNode, choice);
    const placement =
      nextNode.stagePlacement ?? getStagePlacement(choice.next);
    const token = ++movementToken.current;
    setMoving(true);
    const dynamicBlocked = new Set([
      ...worldBlockersRef.current,
      ...ambientRef.current
        .filter((entity) => entity.kind !== "DOG")
        .map(
          (entity) =>
            `${entity.position.column},${entity.position.row}`,
        ),
    ]);
    const plan = placement
      ? planPathToSafeDestination(
          playerRef.current,
          placement.destination,
          dynamicBlocked,
        )
      : null;
    const path = plan?.path ?? [];
    if (placement && !plan) {
      setStory((current) => ({ ...current, selectedChoice: null }));
      setMoving(false);
      return;
    }
    for (const step of path) {
      if (movementToken.current !== token) return;
      for (let attempt = 0; attempt < 6; attempt += 1) {
        const occupied = ambientRef.current.some(
          (entity) =>
            entity.kind !== "DOG" &&
            entity.position.column === step.column &&
            entity.position.row === step.row,
        );
        if (!occupied) break;
        await wait(120);
      }
      const previous = playerRef.current;
      const direction =
        step.column > previous.column
          ? "right"
          : step.column < previous.column
            ? "left"
            : previous.direction;
      const next: PlayerRuntimeState = {
        ...step,
        direction,
        moving: true,
        frame: (previous.frame + 1) % 8,
      };
      playerRef.current = next;
      setPlayer(next);
      await wait(92);
    }
    if (movementToken.current !== token) return;
    setPlayer((current) => {
      const settled: PlayerRuntimeState = {
        ...current,
        direction: horizontalFacing(
          current,
          placement?.faceTarget,
          current.direction,
        ),
        moving: false,
        frame: 0,
      };
      playerRef.current = settled;
      return settled;
    });
    setStory((current) =>
      chooseStoryOption(current, choiceId, currentNode),
    );
    setVotes({ ...EMPTY_VOTES });
    viewerVotes.current.clear();
    setMoving(false);
  }, [
    ensureChoiceTarget,
    executePreparedDirectorPlan,
    moving,
    scenePerforming,
  ]);

  useEffect(() => {
    setRemainingSeconds(STORY_VOTING_SECONDS);
    setVoteResult(null);
    setResultSeconds(STORY_VOTE_RESULT_SECONDS);
    setVotes({ ...EMPTY_VOTES });
    viewerVotes.current.clear();
    resolvingVote.current = false;
    directorPlanRef.current = null;
    directorPlanRequestRef.current = null;
    setDirectorPresentation(EMPTY_DIRECTOR_PRESENTATION);
    directorPresentationRef.current = EMPTY_DIRECTOR_PRESENTATION;
    setPreparedVoteNodeId(node.id);
  }, [node.id]);

  useEffect(() => {
    if (!votingOpen) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds(nextVotingSecond);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [node.id, votingOpen]);

  useEffect(() => {
    if (
      remainingSeconds !== 0 ||
      !canResolveVote ||
      resolvingVote.current
    ) {
      return;
    }
    resolvingVote.current = true;
    const result = createStoryVoteResult(
      votes,
      node.choices.map((choice) => choice.id),
    );
    setVoteResult(result);
    setResultSeconds(STORY_VOTE_RESULT_SECONDS);
    const winningChoice = node.choices.find(
      (choice) => choice.id === result.winner,
    );
    if (winningChoice) {
      void ensureChoiceTarget(node, winningChoice);
    }
    const directorRequest = prepareDirectorPlan(result);
    directorPlanRequestRef.current = directorRequest;
    void directorRequest.finally(() => {
      if (directorPlanRequestRef.current === directorRequest) {
        directorPlanRequestRef.current = null;
      }
    });
  }, [
    canResolveVote,
    ensureChoiceTarget,
    node,
    prepareDirectorPlan,
    remainingSeconds,
    votes,
  ]);

  useEffect(() => {
    if (!voteResult) return;
    if (resultSeconds === 0) {
      const winner = voteResult.winner;
      setVoteResult(null);
      void choose(winner);
      return;
    }
    const timer = window.setTimeout(() => {
      setResultSeconds(nextVoteResultSecond);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [choose, resultSeconds, voteResult]);

  const restart = () => {
    movementToken.current += 1;
    directorAbortRef.current?.abort();
    directorAbortRef.current = null;
    directorLocksRef.current.clear();
    const initialStory = createStoryRuntime();
    const initialPlayer: PlayerRuntimeState = {
      ...PLAYER_START,
      direction: "right",
      frame: 0,
      moving: false,
    };
    playerRef.current = initialPlayer;
    setPlayer(initialPlayer);
    setStory(initialStory);
    setDynamicNodes({});
    dynamicNodesRef.current = {};
    setAgentChoices({});
    setAudienceChoices({});
    setAudienceProposals({});
    setAgentLoadingNodeId(null);
    setDirectorExecuting(false);
    directorExecutingRef.current = false;
    setDirectorPresentation(EMPTY_DIRECTOR_PRESENTATION);
    directorPresentationRef.current = EMPTY_DIRECTOR_PRESENTATION;
    const initialObjects = createInitialDirectorObjects();
    setDirectorObjects(initialObjects);
    directorObjectsRef.current = initialObjects;
    requestedContinuationNodes.current.clear();
    recentDirectorPlansRef.current = [];
    targetGenerationRequests.current.clear();
    setVotes({ ...EMPTY_VOTES });
    viewerVotes.current.clear();
    setMoving(false);
    setScenePerforming(false);
    setRemainingSeconds(STORY_VOTING_SECONDS);
    setVoteResult(null);
    setResultSeconds(STORY_VOTE_RESULT_SECONDS);
    setPreparedVoteNodeId(initialStory.nodeId);
    resolvingVote.current = false;
    directorPlanRef.current = null;
    directorPlanRequestRef.current = null;
  };

  return (
    <main className="game-shell story-shell">
      <div className="game-layout story-layout">
        <MarketScene
          node={node}
          player={player}
          world={world}
          ambientEntities={ambientEntities}
          directorObjects={directorObjects}
          directorPresentation={directorPresentation}
          onPerformingChange={setScenePerforming}
        />
      </div>

      <StoryPanel
        node={node}
        moving={moving}
        performing={scenePerforming || directorExecuting}
        performingLabel={
          directorExecuting
            ? directorPresentation.beatLabel
            : undefined
        }
        selectedChoice={story.selectedChoice}
        voteCounts={votes}
        votingSeconds={remainingSeconds}
        votingOpen={votingOpen}
        agentLoading={agentLoadingNodeId === node.id}
        audienceProposalCounts={Object.fromEntries(
          (["A", "B", "C"] as const).map((choiceId) => [
            choiceId,
            audienceProposals[node.id]?.[choiceId]?.length ?? 0,
          ]),
        )}
        audienceOverriddenChoices={Object.keys(
          audienceChoices[node.id] ?? {},
        ) as StoryChoiceId[]}
        liveState={liveState}
        totalVotes={totalStoryVotes(votes)}
        onRestart={restart}
      />
      {voteResult ? (
        <VoteResultOverlay
          node={node}
          result={voteResult}
          remainingSeconds={resultSeconds}
        />
      ) : null}
      <CommentaryOverlay
        line={commentary.line}
        connected={commentary.connected}
        speaking={commentary.isSpeaking}
        muted={commentary.muted}
        musicMuted={backgroundMusic.muted}
        onToggleMuted={commentary.toggleMuted}
        onToggleMusicMuted={backgroundMusic.toggleMuted}
      />
      <div className="crt-overlay" aria-hidden="true" />
    </main>
  );
}
