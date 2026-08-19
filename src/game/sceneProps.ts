import type { GridPosition } from "./isometric";

export type SceneProp = {
  id: string;
  displayName: string;
  asset: string;
  origin: GridPosition;
  footprint: { columns: number; rows: number };
  visualSize: { width: number; height: number };
  blocksMovement: boolean;
};

export type SceneVegetation = {
  id: string;
  kind: "TREE" | "SHRUB" | "FLOWER_BUSH";
  displayName: string;
  asset: string;
  anomalyAsset?: string;
  position: GridPosition;
  visualSize: { width: number; height: number };
  blocksMovement: boolean;
};

export const MARKET_PROPS: SceneProp[] = [
  {
    id: "market_stall",
    displayName: "瓜摊",
    asset: "/assets/generated/props/market_stall.png",
    origin: { column: 13, row: 12 },
    footprint: { columns: 4, rows: 3 },
    visualSize: { width: 256, height: 192 },
    blocksMovement: true,
  },
  {
    id: "melon_rack",
    displayName: "后排瓜架",
    asset: "/assets/generated/props/melon_rack.png",
    origin: { column: 13, row: 15 },
    footprint: { columns: 2, rows: 2 },
    visualSize: { width: 128, height: 128 },
    blocksMovement: true,
  },
  {
    id: "melon_pallet",
    displayName: "西瓜木盘",
    asset: "/assets/generated/props/melon_pallet.png",
    origin: { column: 15, row: 15 },
    footprint: { columns: 2, rows: 1 },
    visualSize: { width: 128, height: 96 },
    blocksMovement: true,
  },
  {
    id: "melon_pile",
    displayName: "西瓜堆",
    asset: "/assets/generated/props/melon_pile.png",
    origin: { column: 17, row: 15 },
    footprint: { columns: 1, rows: 1 },
    visualSize: { width: 96, height: 96 },
    blocksMovement: true,
  },
  {
    id: "hao_scale_prop",
    displayName: "台秤",
    asset: "/assets/generated/props/hao_scale_prop.png",
    origin: { column: 18, row: 14 },
    footprint: { columns: 1, rows: 1 },
    visualSize: { width: 96, height: 128 },
    blocksMovement: true,
  },
  {
    id: "cutting_table",
    displayName: "切瓜桌",
    asset: "/assets/generated/props/cutting_table.png",
    origin: { column: 17, row: 16 },
    footprint: { columns: 2, rows: 1 },
    visualSize: { width: 160, height: 96 },
    blocksMovement: true,
  },
  {
    id: "empty_crate",
    displayName: "空木箱",
    asset: "/assets/generated/props/empty_crate.png",
    origin: { column: 12, row: 16 },
    footprint: { columns: 1, rows: 1 },
    visualSize: { width: 96, height: 96 },
    blocksMovement: true,
  },
  {
    id: "melon_basket",
    displayName: "西瓜篮",
    asset: "/assets/generated/props/melon_basket.png",
    origin: { column: 19, row: 16 },
    footprint: { columns: 1, rows: 1 },
    visualSize: { width: 96, height: 96 },
    blocksMovement: true,
  },
  {
    id: "black_motorcycle",
    displayName: "华强的摩托车",
    asset: "/assets/generated/props/black_motorcycle.png",
    origin: { column: 24, row: 7 },
    footprint: { columns: 2, rows: 1 },
    visualSize: { width: 160, height: 112 },
    blocksMovement: true,
  },
  {
    id: "short_stool_prop",
    displayName: "矮凳",
    asset: "/assets/generated/props/short_stool_prop.png",
    origin: { column: 20, row: 17 },
    footprint: { columns: 1, rows: 1 },
    visualSize: { width: 64, height: 96 },
    blocksMovement: true,
  },
  {
    id: "price_board",
    displayName: "价牌",
    asset: "/assets/generated/props/price_board.png",
    origin: { column: 12, row: 13 },
    footprint: { columns: 1, rows: 1 },
    visualSize: { width: 64, height: 96 },
    blocksMovement: true,
  },
  {
    id: "single_melon",
    displayName: "待验西瓜",
    asset: "/assets/generated/props/single_melon_whole.png",
    origin: { column: 16, row: 17 },
    footprint: { columns: 1, rows: 1 },
    visualSize: { width: 64, height: 64 },
    blocksMovement: true,
  },
];

const TREE_POSITIONS: GridPosition[] = [
  { column: 5, row: 10 },
  { column: 10, row: 19 },
  { column: 24, row: 19 },
  { column: 28, row: 11 },
];

const SHRUB_POSITIONS: GridPosition[] = [
  { column: 7, row: 11 },
  { column: 9, row: 13 },
  { column: 22, row: 12 },
  { column: 25, row: 14 },
  { column: 7, row: 20 },
  { column: 12, row: 21 },
  { column: 21, row: 21 },
  { column: 26, row: 20 },
];

const FLOWER_POSITIONS: GridPosition[] = [
  { column: 6, row: 13 },
  { column: 10, row: 15 },
  { column: 23, row: 14 },
  { column: 27, row: 13 },
  { column: 8, row: 22 },
  { column: 24, row: 22 },
];

export const MARKET_VEGETATION: SceneVegetation[] = [
  ...TREE_POSITIONS.map((position, index) => ({
    id: `street_tree_${index + 1}`,
    kind: "TREE" as const,
    displayName: "街边大树",
    asset: "/assets/generated/props/street-tree.png",
    anomalyAsset: "/assets/generated/props/street-tree-chomper.png",
    position,
    visualSize: { width: 144, height: 180 },
    blocksMovement: true,
  })),
  ...SHRUB_POSITIONS.map((position, index) => ({
    id: `street_shrub_${index + 1}`,
    kind: "SHRUB" as const,
    displayName: "街边灌木",
    asset: "/assets/generated/props/street-shrub.png",
    position,
    visualSize: { width: 88, height: 70 },
    blocksMovement: false,
  })),
  ...FLOWER_POSITIONS.map((position, index) => ({
    id: `flower_bush_${index + 1}`,
    kind: "FLOWER_BUSH" as const,
    displayName: "街边花丛",
    asset: "/assets/generated/props/flower-bush.png",
    position,
    visualSize: { width: 96, height: 64 },
    blocksMovement: false,
  })),
];

export const ANOMALY_PLANT_POSITIONS: GridPosition[] =
  MARKET_VEGETATION.filter(
    (vegetation) => vegetation.kind === "TREE",
  ).map((vegetation) => vegetation.position);

export const footprintCells = (prop: SceneProp): GridPosition[] =>
  Array.from(
    { length: prop.footprint.columns * prop.footprint.rows },
    (_, index) => ({
      column: prop.origin.column + (index % prop.footprint.columns),
      row: prop.origin.row + Math.floor(index / prop.footprint.columns),
    }),
  );

export const MARKET_PROP_BLOCKERS = new Set(
  [
    ...MARKET_PROPS.filter((prop) => prop.blocksMovement)
      .flatMap(footprintCells),
    ...MARKET_VEGETATION.filter(
      (vegetation) => vegetation.blocksMovement,
    ).map((vegetation) => vegetation.position),
  ].map(({ column, row }) => `${column},${row}`),
);
