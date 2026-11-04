/**
 * Shared lat/lon <-> world-tile projection. Used by the bake scripts AND the
 * runtime so they always agree (spec §4.1).
 *
 * Local equirectangular projection centred on SF (37.7749, -122.4194).
 * 1 tile = 4 m, 16×16 px tiles, 64×64-tile chunks.
 */

export const TILE_METERS = 4;
export const TILE_PX = 16;
export const CHUNK_TILES = 64;

export const CENTER = { lat: 37.7749, lon: -122.4194 } as const;

/** World bounds (lat/lon). Covers SF incl. Treasure Island, excludes Farallons. */
export const BOUNDS = {
  south: 37.7065,
  north: 37.8335,
  west: -122.5155,
  east: -122.3555,
} as const;

const M_PER_DEG_LAT = 111_132.954;
const M_PER_DEG_LON = 111_319.488 * Math.cos((CENTER.lat * Math.PI) / 180);

/** Metres east/north of CENTER. */
function toLocalMeters(lat: number, lon: number) {
  return {
    x: (lon - CENTER.lon) * M_PER_DEG_LON,
    y: (lat - CENTER.lat) * M_PER_DEG_LAT,
  };
}

// World tile origin = north-west corner of BOUNDS, so tile coords are >= 0.
const ORIGIN = toLocalMeters(BOUNDS.north, BOUNDS.west);

/** World size in tiles / chunks. */
export const WORLD_TILES_W = Math.ceil(
  (toLocalMeters(BOUNDS.north, BOUNDS.east).x - ORIGIN.x) / TILE_METERS,
);
export const WORLD_TILES_H = Math.ceil(
  (ORIGIN.y - toLocalMeters(BOUNDS.south, BOUNDS.west).y) / TILE_METERS,
);
export const WORLD_CHUNKS_W = Math.ceil(WORLD_TILES_W / CHUNK_TILES);
export const WORLD_CHUNKS_H = Math.ceil(WORLD_TILES_H / CHUNK_TILES);

/** lat/lon -> fractional world tile coords (x east, y south). */
export function latLonToTile(lat: number, lon: number): { x: number; y: number } {
  const m = toLocalMeters(lat, lon);
  return {
    x: (m.x - ORIGIN.x) / TILE_METERS,
    y: (ORIGIN.y - m.y) / TILE_METERS,
  };
}

/** Fractional world tile coords -> lat/lon. */
export function tileToLatLon(x: number, y: number): { lat: number; lon: number } {
  const mx = x * TILE_METERS + ORIGIN.x;
  const my = ORIGIN.y - y * TILE_METERS;
  return {
    lat: CENTER.lat + my / M_PER_DEG_LAT,
    lon: CENTER.lon + mx / M_PER_DEG_LON,
  };
}

export function tileToChunk(tx: number, ty: number) {
  return { cx: Math.floor(tx / CHUNK_TILES), cy: Math.floor(ty / CHUNK_TILES) };
}

export const chunkKey = (cx: number, cy: number) => `${cx}_${cy}`;

/** lat/lon bbox (south, west, north, east) covered by a chunk. */
export function chunkBBox(cx: number, cy: number) {
  const nw = tileToLatLon(cx * CHUNK_TILES, cy * CHUNK_TILES);
  const se = tileToLatLon((cx + 1) * CHUNK_TILES, (cy + 1) * CHUNK_TILES);
  return { south: se.lat, west: nw.lon, north: nw.lat, east: se.lon };
}
