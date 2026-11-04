export type Hood = {
  name: string;
  bbox: [number, number, number, number];
  label: [number, number];
  /** Flat [x0,y0,x1,y1,...] rings in world-tile coords (outer + holes, even-odd). */
  rings: number[][];
};

export async function loadNeighborhoods(): Promise<Hood[]> {
  const res = await fetch("/neighborhoods.json");
  if (!res.ok) throw new Error("neighborhoods.json missing. Run `npm run bake`.");
  return res.json();
}

function inRings(rings: number[][], x: number, y: number) {
  let inside = false;
  for (const r of rings) {
    for (let i = 0, j = r.length - 2; i < r.length; j = i, i += 2) {
      const xi = r[i], yi = r[i + 1], xj = r[j], yj = r[j + 1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
  }
  return inside;
}

/** Point-in-polygon lookup against the shipped simplified polygon set (spec §4.3). */
export function hoodAt(hoods: Hood[], x: number, y: number): Hood | null {
  for (const h of hoods) {
    const [x0, y0, x1, y1] = h.bbox;
    if (x < x0 || x > x1 || y < y0 || y > y1) continue;
    if (inRings(h.rings, x, y)) return h;
  }
  return null;
}

/** Title-card subtitles. Warm and place-flavoured only (spec §11). */
const TAGLINES: Record<string, string> = {
  "Sunset/Parkside": "fog rolling in",
  "Outer Richmond": "salt on the wind",
  "Inner Richmond": "dumpling steam and fog",
  "Golden Gate Park": "a thousand acres of whispering green",
  "Inner Sunset": "the fog’s front porch",
  Mission: "murals wake with the sun",
  Tenderloin: "old bricks, older stories",
  "Haight Ashbury": "painted ladies and patchouli",
  "North Beach": "espresso and accordions",
  Chinatown: "lanterns sway overhead",
  "Financial District/South Beach": "towers catching the morning light",
  "Twin Peaks": "the whole city below you",
  Presidio: "eucalyptus and old forts",
  Marina: "kites over the green",
  "Bernal Heights": "a hill with its own weather",
  "Castro/Upper Market": "rainbow crosswalks",
  "Lincoln Park": "cliffs above the strait",
  "Bayview Hunters Point": "sun on the bay side",
  Excelsior: "front gardens and corner bakeries",
  "Visitacion Valley": "a quiet valley, waiting to be explored",
  "McLaren Park": "wild hills in the city’s south",
  "Treasure Island": "the bay all around",
  "Noe Valley": "strollers and sunshine",
  "Potrero Hill": "crooked streets, wide views",
  "Russian Hill": "steep stairs, secret gardens",
  "Hayes Valley": "little shops, big trees",
  Lakeshore: "lake breeze and dune grass",
  "South of Market": "warehouses full of echoes",
};
const FALLBACK = ["spirits stir nearby", "something is listening", "new streets to wander", "the city hums softly"];

export function taglineFor(name: string) {
  if (TAGLINES[name]) return TAGLINES[name];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) | 0;
  return FALLBACK[Math.abs(h) % FALLBACK.length];
}
