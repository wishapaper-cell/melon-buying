import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GRID_COLUMNS,
  GRID_ROWS,
  gridDepth,
  findGridPath,
  planPathToSafeDestination,
  isWalkable,
  ISO_TILES,
  moveGridPosition,
  projectGridToPercent,
} from "../src/game/isometric";
import { MARKET_PROP_BLOCKERS } from "../src/game/sceneProps";

describe("32×24 星露谷式瓦片地图、A*寻路与深度", () => {
  it("使用 8-bit 的 16 帧行走与 4 帧待机资源", () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          "public",
          "assets",
          "generated",
          "manifest.json",
        ),
        "utf8",
      ),
    ) as {
      player: { left: string[]; right: string[]; idle: string[] };
      canvas: { width: number; height: number };
    };
    expect(manifest.player.left).toHaveLength(8);
    expect(manifest.player.right).toHaveLength(8);
    expect(manifest.player.idle).toHaveLength(4);
    expect(manifest.canvas).toEqual({ width: 64, height: 96, footMargin: 2 });
  });

  it("生成完整 32×24 逻辑地块", () => {
    expect(ISO_TILES).toHaveLength(GRID_COLUMNS * GRID_ROWS);
    expect(new Set(ISO_TILES.map((tile) => `${tile.column},${tile.row}`)).size)
      .toBe(768);
  });

  it("把网格坐标投影为正交瓦片屏幕坐标", () => {
    const origin = projectGridToPercent({ column: 0, row: 0 });
    const east = projectGridToPercent({ column: 1, row: 0 });
    const south = projectGridToPercent({ column: 0, row: 1 });
    expect(east.x).toBeGreaterThan(origin.x);
    expect(south.x).toBe(origin.x);
    expect(east.y).toBe(origin.y);
    expect(south.y).toBeGreaterThan(origin.y);
  });

  it("家具和 NPC 格阻止玩家穿透", () => {
    expect(isWalkable({ column: 7, row: 9 })).toBe(true);
    expect(isWalkable({ column: 8, row: 4 })).toBe(false);
    expect(isWalkable({ column: 5, row: 2 })).toBe(false);
  });

  it("四方向移动与纵向动态深度一致", () => {
    const start = { column: 7, row: 9 };
    expect(moveGridPosition(start, "arrowleft")).toEqual({
      column: 6,
      row: 9,
    });
    expect(
      gridDepth({ column: 8, row: 8 }),
    ).toBeGreaterThan(gridDepth({ column: 4, row: 4 }));
  });

  it("选项目的地可生成自动行走路径", () => {
    const path = findGridPath(
      { column: 7, row: 18 },
      { column: 15, row: 14 },
    );
    expect(path.length).toBeGreaterThan(0);
    expect(path.at(-1)).toEqual({ column: 15, row: 14 });
  });

  it("瓜摊、西瓜、秤和桌凳占地都进入动态碰撞层", () => {
    expect(MARKET_PROP_BLOCKERS.has("13,12")).toBe(true);
    expect(MARKET_PROP_BLOCKERS.has("18,14")).toBe(true);
    expect(MARKET_PROP_BLOCKERS.has("17,16")).toBe(true);
    expect(
      isWalkable(
        { column: 13, row: 12 },
        undefined,
        MARKET_PROP_BLOCKERS,
      ),
    ).toBe(false);
  });

  it("被物件占用的剧情目标会改选相邻可达落脚点", () => {
    const plan = planPathToSafeDestination(
      { column: 4, row: 22 },
      { column: 13, row: 12 },
      MARKET_PROP_BLOCKERS,
    );
    expect(plan).not.toBeNull();
    expect(plan!.destination).not.toEqual({ column: 13, row: 12 });
    expect(MARKET_PROP_BLOCKERS.has(
      `${plan!.destination.column},${plan!.destination.row}`,
    )).toBe(false);
    expect(plan!.path.every(
      (cell) => !MARKET_PROP_BLOCKERS.has(`${cell.column},${cell.row}`),
    )).toBe(true);
  });
});
