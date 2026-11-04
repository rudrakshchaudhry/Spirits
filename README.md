# SF Spirits

Top-down pixel game on a real map of San Francisco. Spec: `.plans/sf-spirits-spec.md`.

## Run

```bash
npm install
npm run dev            # http://localhost:3000
```

URL flags: `?dev=1` (coordinates readout, click the big map (M) to teleport),
`?at=37.7840,-122.4140` (spawn at lat,lon), `?noclip=1`.

Controls: WASD / arrows, Shift to jog, **E / Space / click** to meet a nearby spirit, **B** Spirit Atlas,
M city map. On touch devices, drag in the lower-left for the joystick and tap "Meet".

Encounters: meet (Mistral-written spirit + streamed greeting + wish riddle) → play
(Rustle rhythm game, or Take Two film trivia for film echoes) → befriend at 100 trust.
Progress is saved in Supabase under a per-device guest account.

## Terrain bake

Baked output (`public/chunks/`, `public/minimap.png`, `public/neighborhoods.json`) is committed,
so you only need this to refresh the terrain:

```bash
npm run fetch:terrain  # DataSF neighborhoods + BBBike OSM extract -> data/raw/ (gitignored)
npm run bake           # rasterise -> public/chunks/*.bin (only changed chunks are rewritten)
```

## City data (Elasticsearch)

```bash
npm run es:setup                 # create indices (places, spirits, neighborhoods, events)
npm run ingest                   # all DataSF sets → places (~148k docs, ~2 min)
npm run ingest -- business film  # or just some: neighborhoods landmarks art film parks business trees
```

Each job upserts by source ID and prunes rows that disappeared (closed shops, removed trees).
`GET /api/world?chunks=30_32,31_32` returns places plus today's spirits for those chunks.

```bash
npx tsx scripts/embed-places.ts        # mistral-embed vectors for non-tree places (hybrid wish search)
npx tsx scripts/prewarm.ts 10          # pre-generate spirits along the demo route (+ cheat-sheet)
npx tsx scripts/check-demo-queries.ts  # run every query in elastic/demo-queries.console
npx tsx scripts/smoke-mistral.ts       # Mistral health check
```

Supabase schema lives in `supabase/migrations/`. Demo script: `docs/DEMO.md`.
Pitch claims vs. build: `docs/PITCH-CHECKLIST.md`.

Copy `.env.example` to `.env.local` and fill in the keys.
