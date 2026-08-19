export const GRID_COLUMNS = 32;
export const GRID_ROWS = 24;
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 64;
export const WORLD_WIDTH = GRID_COLUMNS * TILE_WIDTH;
export const WORLD_HEIGHT = GRID_ROWS * TILE_HEIGHT;

export type GridPosition = {
  column: number;
  row: number;
};

export type PlayerRuntimeState = GridPosition & {
  direction: "left" | "right";
  frame: number;
  moving: boolean;
};

const STATIC_COLLISIONS = new Set<string>();
const keyOf = ({ column, row }: GridPosition): string => `${column},${row}`;

// 北侧建筑、两侧水渠/树篱。
for (let column = 0; column < GRID_COLUMNS; column += 1) {
  for (let row = 0; row <= 5; row += 1) {
    STATIC_COLLISIONS.add(`${column},${row}`);
  }
}
for (let row = 0; row < GRID_ROWS; row += 1) {
  STATIC_COLLISIONS.add(`0,${row}`);
  STATIC_COLLISIONS.add(`1,${row}`);
  STATIC_COLLISIONS.add(`30,${row}`);
  STATIC_COLLISIONS.add(`31,${row}`);
}

// 南侧围墙与花坛只在三条道路处留出口。
const SOUTH_EXITS = new Set([
  3, 4, 5,
  15, 16, 17,
  27, 28, 29,
]);
for (let row = 20; row < GRID_ROWS; row += 1) {
  for (let column = 2; column < 30; column += 1) {
    if (!SOUTH_EXITS.has(column)) STATIC_COLLISIONS.add(`${column},${row}`);
  }
}
for (const column of [6, 7, 8, 9, 10, 11, 12, 13, 18, 19, 20, 21, 22, 23, 24, 25]) {
  STATIC_COLLISIONS.add(`${column},19`);
}

export const projectGridToPixel = ({
  column,
  row,
}: GridPosition): { x: number; y: number } => ({
  x: column * TILE_WIDTH + TILE_WIDTH / 2,
  y: row * TILE_HEIGHT + TILE_HEIGHT,
});

export const projectGridToPercent = (position: GridPosition) => {
  const pixel = projectGridToPixel(position);
  return {
    x: (pixel.x / WORLD_WIDTH) * 100,
    y: (pixel.y / WORLD_HEIGHT) * 100,
  };
};

export const gridDepth = ({ row, column }: GridPosition): number =>
  300 + row * 30 + column;

export const isInsideGrid = ({ column, row }: GridPosition): boolean =>
  column >= 0 &&
  column < GRID_COLUMNS &&
  row >= 0 &&
  row < GRID_ROWS;

export const isWalkable = (
  position: GridPosition,
  _ignoreNpcId?: string,
  additionalBlocked: ReadonlySet<string> = new Set(),
): boolean => {
  if (
    !isInsideGrid(position) ||
    STATIC_COLLISIONS.has(keyOf(position)) ||
    additionalBlocked.has(keyOf(position))
  ) {
    return false;
  }
  return true;
};

export const moveGridPosition = (
  current: GridPosition,
  key: string,
): GridPosition => {
  const vectors: Record<string, GridPosition> = {
    w: { column: 0, row: -1 },
    arrowup: { column: 0, row: -1 },
    s: { column: 0, row: 1 },
    arrowdown: { column: 0, row: 1 },
    a: { column: -1, row: 0 },
    arrowleft: { column: -1, row: 0 },
    d: { column: 1, row: 0 },
    arrowright: { column: 1, row: 0 },
  };
  const vector = vectors[key];
  return vector
    ? {
        column: current.column + vector.column,
        row: current.row + vector.row,
      }
    : current;
};

const PATH_VECTORS: GridPosition[] = [
  { column: 1, row: 0 },
  { column: -1, row: 0 },
  { column: 0, row: 1 },
  { column: 0, row: -1 },
];

const heuristic = (left: GridPosition, right: GridPosition) =>
  Math.abs(left.column - right.column) + Math.abs(left.row - right.row);

export const findGridPath = (
  start: GridPosition,
  destination: GridPosition,
  additionalBlocked: ReadonlySet<string> = new Set(),
): GridPosition[] => {
  if (keyOf(start) === keyOf(destination)) return [];
  if (!isWalkable(destination, undefined, additionalBlocked)) return [];

  const open = new Set<string>([keyOf(start)]);
  const positions = new Map<string, GridPosition>([[keyOf(start), start]]);
  const previous = new Map<string, GridPosition>();
  const distance = new Map<string, number>([[keyOf(start), 0]]);
  const score = new Map<string, number>([
    [keyOf(start), heuristic(start, destination)],
  ]);

  while (open.size > 0) {
    const currentKey = [...open].sort(
      (left, right) =>
        (score.get(left) ?? Number.POSITIVE_INFINITY) -
        (score.get(right) ?? Number.POSITIVE_INFINITY),
    )[0]!;
    const current = positions.get(currentKey)!;
    if (currentKey === keyOf(destination)) {
      const path: GridPosition[] = [];
      let cursor = current;
      while (keyOf(cursor) !== keyOf(start)) {
        path.unshift(cursor);
        cursor = previous.get(keyOf(cursor))!;
      }
      return path;
    }
    open.delete(currentKey);

    for (const vector of PATH_VECTORS) {
      const next = {
        column: current.column + vector.column,
        row: current.row + vector.row,
      };
      const nextKey = keyOf(next);
      if (!isWalkable(next, undefined, additionalBlocked)) continue;
      const nextDistance = (distance.get(currentKey) ?? 0) + 1;
      if (nextDistance >= (distance.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }
      previous.set(nextKey, current);
      positions.set(nextKey, next);
      distance.set(nextKey, nextDistance);
      score.set(nextKey, nextDistance + heuristic(next, destination));
      open.add(nextKey);
    }
  }
  return [];
};

export const planPathToSafeDestination = (
  start: GridPosition,
  requested: GridPosition,
  additionalBlocked: ReadonlySet<string> = new Set(),
): { destination: GridPosition; path: GridPosition[] } | null => {
  const candidates: GridPosition[] = [];
  for (let radius = 0; radius <= 6; radius += 1) {
    for (let rowOffset = -radius; rowOffset <= radius; rowOffset += 1) {
      for (let columnOffset = -radius; columnOffset <= radius; columnOffset += 1) {
        if (Math.abs(columnOffset) + Math.abs(rowOffset) !== radius) continue;
        candidates.push({
          column: requested.column + columnOffset,
          row: requested.row + rowOffset,
        });
      }
    }
  }
  for (const destination of candidates) {
    if (!isWalkable(destination, undefined, additionalBlocked)) continue;
    const path = findGridPath(start, destination, additionalBlocked);
    if (path.length > 0 || keyOf(start) === keyOf(destination)) {
      return { destination, path };
    }
  }
  return null;
};

export const ISO_TILES: GridPosition[] = Array.from(
  { length: GRID_COLUMNS * GRID_ROWS },
  (_, index) => ({
    column: index % GRID_COLUMNS,
    row: Math.floor(index / GRID_COLUMNS),
  }),
);
