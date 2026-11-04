# SF Spirits

An open-world pixel game on the real map of San Francisco. Spirits live at real places from SF open data
(street trees, local shops, film locations, public art, landmarks, parks). You find them, play a short game
written from the real record, and befriend them. Spec: `.plans/sf-spirits-spec.md` · progress: `.plans/long-term-progress.md`.

## Run
```bash
nvm use                # Node 22 (.nvmrc); any Node >= 20.9 works
cp .env.example .env.local   # then fill in the keys (see below)
npm ci
npm run dev            # http://localhost:3000
npm run check          # lint + typecheck + unit tests (vitest)
```
Or with Docker (no local Node needed): `npm run docker:up` builds the production image and starts the app on
:3000 plus a cron sidecar. See [docs/DEPLOY.md](docs/DEPLOY.md#7-option-b-docker--self-hosting).

### Setting up on a new machine
The game needs three hosted services; nothing runs locally except the Next.js app.
| Service | What it holds | First-time setup |
|---|---|---|
| **Elasticsearch** (Elastic Cloud, 9.x) | places, spirit cards, neighbourhoods, gatherings | `npm run es:setup && npm run ingest`, then the scripts in [DEPLOY §5](docs/DEPLOY.md#5-data-one-time-from-your-machine) |
| **Supabase** | player state (friendships, keepsakes, trades, crews) | apply `supabase/migrations/*.sql` in filename order ([DEPLOY §4](docs/DEPLOY.md#4-supabase-settings)) |
| **Mistral** | spirit cards, greetings, embeddings, moderation | just the API key |

If you're reusing the existing Elastic and Supabase projects, only `.env.local` is needed: copy it securely from the
old machine (it is git-ignored and must never be committed). The terrain (`public/chunks`, `public/minimap.png`) is
committed, so `npm run fetch:terrain && npm run bake` is only needed to rebuild the map.
URL flags: `?dev=1` (coordinates, dev conditions panel, click-the-map teleport), `?at=lat,lon`, `?noclip=1`.

**Controls:** WASD / arrows (Shift jogs) · **E / Space / click** meet a spirit · **B** Spirit Atlas · **T** Town · **M** city map.
On phones, drag in the lower-left for the joystick and tap "Meet".

## What's in the game
- **The city:** OSM terrain baked into 2,098 chunks (`npm run bake`); 41 neighborhoods with title cards.
- **Spirits:** deterministic daily spawns from 147k Elasticsearch places. Six families, procedural sprites. Condition variants (night/fog/rain/blossom) spawn from live Open-Meteo weather and `suncalc`.
- **Encounters:** a Mistral Large spirit card (JSON mode, moderation, cached in ES) → a streamed Mistral Small greeting → one game per family:
  - Rustle / Birdsong (rhythm)
  - Rush Hour (shops)
  - Then or Now (landmarks)
  - Take Two (films)
  - Mosaic (art)

  Trust is scored on the server.
- **Keepsakes & wishes:** glints typed by nearby places (every 2 h), condition and neighborhood-exclusive keepsakes. Gifts grant wishes (+40, rare friendship, secret chapter). Hybrid BM25 + kNN (RRF) links each wish to a place across town.
- **Living world:** day/night, fog and rain visuals; a 311 haze veil (aggregates only); new-shop sparkle; a daily featured rare.
- **Together:** onboarding (handle, crew, companion), an evolving companion, milestone unlocks, a weekly crew board, keepsake trading, public profiles, and gatherings at public parks (GPS check-in stores only yes/no; Realtime presence; co-op game).

## Data & ops scripts
```bash
npm run fetch:terrain && npm run bake  # terrain (output is committed)
npm run es:setup && npm run ingest     # DataSF → Elasticsearch (incl. 311 haze)
npx tsx scripts/embed-places.ts        # mistral-embed vectors
npx tsx scripts/seed-gatherings.ts 3   # gatherings (add --now for a live test one)
npx tsx scripts/curate-quest.ts        # Tenderloin → Ocean Beach sea-shell quest
npx tsx scripts/prewarm.ts 10          # pre-generate demo-route spirits
npx tsx scripts/check-demo-queries.ts  # run elastic/demo-queries.console
npx tsx scripts/e2e-quest.ts <placeId> # API e2e: meet → play → pickup → gift
npx tsx scripts/e2e-social.ts          # API e2e: onboarding, trades, crews, gatherings
```
Supabase schema: `supabase/migrations/`. Deploy: `docs/DEPLOY.md`. Demo: `docs/DEMO.md`, `PITCH_NOTES.md`.
Copy `.env.example` to `.env.local` and fill in the keys.
