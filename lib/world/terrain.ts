/**
 * Terrain classes shared by the bake script (writes them) and the runtime
 * (renders + collides on them).
 *
 * Chunk tile byte = terrain * 16 + variant.
 *   - water / deep: variant = 4-bit mask of non-water neighbours (N=1,E=2,S=4,W=8) → shoreline
 *   - building:     variant = 4-bit mask of non-building neighbours → roof edges / front wall
 *   - everything else: variant = 0..3 noise for texture variety
 */
export const T = {
  DEEP: 0, // bay / ocean
  WATER: 1, // lakes, reservoirs, ponds
  LAND: 2, // yards, lots, unclassified ground
  GRASS: 3, // parks, lawns, cemeteries, golf
  FOREST: 4, // woods, scrub
  SAND: 5, // beaches, dunes, bunkers
  SIDEWALK: 6,
  ROAD: 7,
  PATH: 8, // footpaths, trails, cycleways
  PIER: 9,
  BUILDING: 10,
  PLAZA: 11, // pedestrian areas, squares
} as const;
export type Terrain = (typeof T)[keyof typeof T];
export const TERRAIN_COUNT = 12;

export const EDGE_MASKED = new Set<number>([T.DEEP, T.WATER, T.BUILDING]);

/** Solid for player collision. */
export const SOLID = new Set<number>([T.DEEP, T.WATER, T.BUILDING]);

export const terrainOf = (tile: number) => tile >> 4;
export const variantOf = (tile: number) => tile & 15;
export const isSolidTile = (tile: number) => SOLID.has(tile >> 4);

/** Base colours, also used for the baked minimap. */
export const TERRAIN_COLORS: Record<number, [number, number, number]> = {
  [T.DEEP]: [46, 92, 138],
  [T.WATER]: [64, 126, 168],
  [T.LAND]: [150, 168, 112],
  [T.GRASS]: [104, 164, 84],
  [T.FOREST]: [62, 118, 66],
  [T.SAND]: [228, 208, 150],
  [T.SIDEWALK]: [196, 192, 182],
  [T.ROAD]: [88, 90, 98],
  [T.PATH]: [196, 168, 118],
  [T.PIER]: [148, 112, 78],
  [T.BUILDING]: [176, 128, 112],
  [T.PLAZA]: [210, 200, 180],
};
