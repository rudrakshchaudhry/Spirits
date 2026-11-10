# SF Spirits — Implementation Spec

**Status:** Stage 1 = hackathon build (today, 2026-11-03). Long-term vision kept in view; every Stage 1 shortcut is labeled so it can be replaced later.
**Builder:** Solo developer + Claude. Order work so a demoable build exists at every checkpoint.

---

## 1. Product summary

An open-world, top-down 2D tile game on a real map of San Francisco. The player walks a wanderer through real streets (joystick on touch, WASD/arrows on keyboard) and finds spirits that live at real places drawn from city data: street trees, parks, public art, historic landmarks, film locations and local businesses. Befriending is a three-beat encounter: **meet → play → gift**. A Spirit Atlas records friends, keepsakes and explored neighborhoods. The world reacts to real conditions (time of day, weather, season, 311 reports, new businesses). Social layer: neighborhood crews, a weekly board, trading, and in-person group gatherings at public places.

**Core loop (everything else supports this):** explore → find spirit → befriend → collect keepsakes → fulfil wishes across town → grow the Atlas.

---

## 2. Decisions made in the interview

| Topic | Decision |
|---|---|
| Scope | Hackathon Stage 1 today; long-term foundations kept in mind |
| Platform | Web app now (mobile-friendly: touch joystick + keyboard). Native mobile later |
| Movement / presence | **Virtual walking + real GPS check-in** for gatherings (and future in-person bonuses) |
| Visual style | **Tile-based 2D pixel game** (Phaser) |
| Playable area | Whole city walkable; 2–3 showcase neighborhoods densely tuned. Later stages bring every neighborhood up to the same detail |
| Mistral usage | **Lazy-generate and cache** spirit persona/wish/trivia in Elasticsearch on first encounter; greetings may stay live |
| Mini-games | **All five** for the demo (tree rhythm, shopkeeper memory, landmark Then-or-Now, film trivia, art pattern puzzle) |
| Trust | **Game score fills, gift finishes** |
| Wish hints | **Riddle + Atlas clue** (neighborhood glows after hearing the hint twice) |
| Failure | **Spirit wanders off for that player only**, ~10 min cooldown, earned trust kept |
| Spirit model | **Shared and sparse**: deterministic seed; everyone meets the same named spirit at the same place |
| Spirit art | **Procedural pixel sprites** (family base + data-driven parts and palettes) |
| Keepsakes | **Place-typed ambient pickups**, some condition-gated |
| Companion | **Pick one of 3 starters at onboarding**; evolves with milestones and absorbs traits of neighborhoods explored most |
| Social in demo | As much as possible working for real: crews + board, trading, gatherings, profiles |
| Live signals in demo | All: day/night + weather, 311 haze, new-business spirits, daily featured rare |
| Accounts | **Supabase auth + Postgres** for player state; Elasticsearch for world/geo/content |
| Wish → place linking | **Hybrid Elasticsearch search** (geo + keyword + vector) over DataSF-sourced places |
| Unlocks | **Milestone-gated**, with a demo-mode toggle that unlocks everything |
| Guardrails | Claude's call. See §11 |
| Tile pipeline, stack | Claude's call. See §3 and §4 |

---

## 3. Tech stack (decided)

**Next.js (App Router) + TypeScript + Phaser 3, single repo, deployed on Vercel.**

Why: one language end to end. Official TS clients exist for Elasticsearch (`@elastic/elasticsearch`), Mistral (`@mistralai/mistralai`) and Supabase (`@supabase/supabase-js`). API routes sit next to the game. Vercel Cron covers the scheduled refresh jobs. One deploy target, so there is less to break on demo day. The data-ingest scripts are TS run with `tsx`, kept in `/scripts` so they can later move to a Python or worker service without touching the client.

| Layer | Choice |
|---|---|
| Game engine | Phaser 3 inside a client-only React component (`dynamic(..., { ssr: false })`) |
| UI overlay (Atlas, dialogs, inventory, trade, menus) | React + Tailwind, sitting on top of the canvas |
| Game ↔ UI bridge | Small typed event bus + Zustand store (Phaser emits `encounter:start`, React renders the dialog, results flow back) |
| API | Next.js route handlers (`/app/api/*`), Node runtime |
| World / geo / content store | Elastic Cloud (Elasticsearch 8.x/9.x) |
| Player state, auth, realtime | Supabase (Auth, Postgres with RLS, Realtime channels) |
| LLM | Mistral: `mistral-small-latest` for live greetings (fast), `mistral-large-latest` for persona/lore/trivia generation, `mistral-embed` for place embeddings, Mistral moderation endpoint |
| Weather | Open-Meteo (no key) for current SF conditions |
| Sun times | `suncalc` (local computation) |
| Hosting | Vercel (app + cron); static tile chunks served from `/public` or a CDN bucket |

**Long-term notes:** for the native mobile app, the plan is a Capacitor wrap of the same web build first, and a rewrite only if needed. Phaser runs fine in a WebView. The API boundary (`/api/*`) is the contract that any future client also uses.

---

## 4. World and map

### 4.1 Coordinate system
- One shared module `lib/geo/projection.ts` converts lat/lon ↔ world tile coordinates, using a local equirectangular projection centered on SF (37.7749, -122.4194). Both the bake script and the runtime use it, so they always agree.
- **Scale: 1 tile = 4 m, 16×16 px tiles.** SF (~11.5 km × 11.5 km) ≈ 2,900 × 2,900 tiles.
- **Chunks: 64×64 tiles** (256 m square), about 2,000 chunks citywide, many of them water.
- Player walk speed ≈ 10 tiles/s (~40 m/s game-time), so crossing the city takes ~5 min. This keeps cross-town gift quests real but not tedious. *Later:* Muni-stop fast travel and a bike boost.

### 4.2 Two-layer world (the decision on tile generation)
Terrain and entities change at very different rates, so they are stored separately.

1. **Terrain layer: pre-baked, static.** Streets, sidewalks, water, coastline, parks/green, sand, building footprints, hills shading.
   - Source: an OpenStreetMap extract for the SF bounding box (Overpass API or a Geofabrik NorCal extract clipped with `osmium`).
   - `scripts/bake-tiles.ts` rasterizes the polygons and lines into per-chunk tile-index grids, then auto-tiles edges (shoreline, building roof/wall edges) and writes `public/chunks/{cx}_{cy}.bin` (raw 64×64 bytes, `terrain*16 + variant`; open-water chunks are omitted and listed in `manifest.json`). Collision layer: buildings and water. Also writes `public/minimap.png` and `public/neighborhoods.json`.
   - **Updates:** terrain changes rarely (new streets or buildings). The bake is re-run on demand or monthly and is idempotent per chunk, so only changed chunks are re-written (content hash). New businesses, trees and art **never** require a re-bake.
2. **Entity layer: dynamic, from Elasticsearch.** Trees, art, landmarks, film spots, businesses, keepsake pickups, spirits and event markers.
   - When the player enters a new chunk, the client prefetches entities for the 3×3 chunks around them with `GET /api/world?bbox=...`, which runs an ES `geo_bounding_box` query. Results are cached client-side per chunk with a short TTL.
   - Entities draw as sprites over the terrain: trees as tree tiles (species family → tile variant), businesses as small storefront markers, and so on.

**Showcase neighborhoods (dense tuning):** Mission, Golden Gate Park / Inner Sunset → Ocean Beach, and the Tenderloin. Together they enable the signature quest from the pitch: a Tenderloin tree misses the sea, so you go to Ocean Beach for a shell. The rest of the city is fully walkable with generic data-driven content.

### 4.3 Neighborhood presence
- Neighborhood polygons come from DataSF **Analysis Neighborhoods** (`j2bu-swwd`; `p5b7-5n3h` is only a map view over it and returns no geometry), stored in ES as `geo_shape`. The bake also uses them as the land mask, reconciled against the OSM coastline.
- The client knows the current neighborhood through a point-in-polygon check against a simplified polygon set shipped once (~41 polygons). It shows a title card on entering a neighborhood ("Outer Sunset — fog rolling in") and marks the neighborhood explored in the Atlas.
- "Explored" = the share of a neighborhood's chunks the player has visited, stored as a bitset per player.

### 4.4 Visual atmosphere
- Day/night tint plus a lamp-glow light layer after dark.
- Fog: a drifting semi-transparent noise overlay, stronger in western neighborhoods.
- Rain particles.
- **311 haze:** a desaturation and grey overlay per neighborhood polygon, with alpha driven by that neighborhood's haze score (§8.3).

---

## 5. Data sources and ingestion

All city data lands in one unified `places` index in ES (one schema, `kind` field), plus supporting indices.

| Dataset | Source | ID / status | Used for |
|---|---|---|---|
| Street Tree Inventory | DataSF | `tkzw-k3nq` ✅ (updated daily) | Tree spirits, tree tiles, acorn/leaf keepsakes, blossom spirits |
| Recreation and Parks Properties | DataSF | `gtr9-ntp6` ✅ | Park biomes and park-specific species |
| Film Locations in San Francisco | DataSF | `yitu-d5am` ✅ | Echo spirits plus trivia. The dataset now ships lat/lon for ~96% of rows; rows without coordinates are skipped, so no geocoding is needed |
| Registered Business Locations | DataSF | `g8m3-pdis` ✅ (updated daily) | Shopkeeper spirits; new openings via location start date |
| 311 Cases | DataSF | `vw6y-z8j6` ✅ (updated daily) | Neighborhood haze |
| Analysis Neighborhoods | DataSF | `j2bu-swwd` ✅ (`p5b7-5n3h` is a map view with no geometry) | Neighborhood polygons, crews, terrain land mask |
| Civic Art Collection / Public Art | DataSF (SF Arts Commission) | `r7bn-7v9c` ✅ (plus StreetSmArts Murals `wg8w-68vc`) | Legendary art guardians |
| Historic Landmarks | DataSF (SF Planning) | `rzic-39gi` ✅ (Article 10, with year built, style, significance) | Ancient landmark spirits |
| Fallback for ❓ rows | OpenStreetMap `tourism=artwork`, `historic=*` | Overpass | Used if the DataSF sets are missing or lack coordinates |
| Terrain | OpenStreetMap | BBBike SF extract (GeoJSON, weekly). Public Overpass timed out on buildings | Tile bake |
| Weather | Open-Meteo | No key | Fog/rain conditions |

Note: DataSF moved from `data.sfgov.org` to **`data.sf.gov`** (the old host returns a 301 redirect). Use the new host with the SODA API (`/resource/{id}.json`, `$where`, `$limit`, paging). A free Socrata app token raises the rate limits.

**Business filtering:** only businesses with a physical location in SF that are currently open (no end date), and only consumer-facing categories (food, retail, personal services, arts and recreation). Skip home-based or administrative registrations and anything without coordinates. This keeps shopkeeper spirits at doors you can actually walk into.

**Ingest scripts** (`scripts/ingest/*.ts`, each idempotent, upserting by source ID):
- `ingest-trees`, `ingest-parks`, `ingest-film` (with geocoding), `ingest-business`, `ingest-art`, `ingest-landmarks`, `ingest-neighborhoods`, `ingest-311` (aggregation only).
- `embed-places`: computes `mistral-embed` vectors for places with meaningful text (art, landmarks, films, businesses, parks, and tree species plus notable-tree text). Trees are embedded per **species**, not per tree, to keep cost bounded.
- Hackathon shortcut: run the ingest scripts once, locally. Later: Vercel Cron (daily for trees and businesses, hourly for 311).

---

## 6. Elasticsearch design

### 6.1 Indices
**`places`**: every real-world anchor.
```
id (keyword, "<kind>:<sourceId>"), kind (keyword: tree|park|art|landmark|film|business),
name (text + keyword), description (text), location (geo_point), shape (geo_shape, parks only),
neighborhood (keyword), attrs (object: species, dbh, plant_date, artist, year, medium,
film_title, film_year, business_category, opened_at, ...),
tags (keyword[]: "flowering","coastal","oldest","bakery","bookstore",...),
keepsake_types (keyword[]), embedding (dense_vector 1024, cosine), updated_at
```
**`spirits`**: the cache of generated content, keyed by place.
```
spirit_id (= place id + variant), place_id, family, species_key, rarity, temperament,
name, persona (text), voice_notes, wish {keepsake_type, theme, riddle, target_place_ids[]},
lore {chapters[]}, minigame_content (object, per family), sprite_seed, generated_at, model, moderation
```
**`neighborhoods`**: `name`, `shape` (geo_shape), `haze_score`, `open_311_count`, `area_km2`, `exclusive_keepsakes[]`, `exclusive_species[]`.
**`events`**: daily featured rare and gatherings (`starts_at`, `ends_at`, `location`, `place_id`, `spirit_id`, `min_players`).

### 6.2 Key queries
- **Nearby world:** `geo_bounding_box` on `places.location` for the 3×3 chunk bbox, filtered by `kind`, `size` capped per chunk.
- **"What's near me" radar:** `geo_distance` (150 m) plus a sort on `_geo_distance`.
- **Wish linking (hybrid):** given a wish `{keepsake_type, theme}` from Mistral and the spirit's location:
  - `bool.filter`: `keepsake_types == keepsake_type`
  - `should`: BM25 match on `theme` against `name`/`description`/`tags`
  - kNN on `embedding` with the embedded theme
  - Combine with RRF (or a manual weighted sum if the RRF retriever isn't on the tier)
  - **Function score boost** for places *outside* the spirit's neighborhood and in under-visited neighborhoods (Excelsior, Bayview, Outer Sunset, Visitacion Valley, and others from a list), with a mild decay for extreme distance.
  - Keep the top 3 as `target_place_ids` (any of them satisfies the wish).
- **Spirit relationships:** "spirits that know each other": `more_like_this` / kNN between place embeddings, used in lore ("my cousin lives by the old oak in Bernal").
- **Haze aggregation:** 311 docs aggregated by neighborhood (`terms` + `filter status=open`) → `neighborhoods.haze_score`.

---

## 7. Spirits

### 7.1 Families

| Family | Anchor | Rarity range | Mini-game | Notes |
|---|---|---|---|---|
| Tree spirit | Street tree | common → rare (oldest trees) | Rhythm | Species → look and behavior; tree age → rarity and tempo |
| Park spirit | Park polygon | uncommon → rare | Rhythm variant or species-specific | Each park is a biome with its own species list |
| Shopkeeper | Business | uncommon; new shops = rare for 14 days | Memory/serve | One per eligible business, only found there |
| Ancient | Historic landmark | rare | Then or Now | "Remembers the city's past" |
| Echo | Film location | uncommon → rare | Film trivia | Trivia grounded in the film row |
| Guardian | Public artwork | **legendary, one of a kind** | Pattern puzzle | Full lore only after solving |
| Condition spirits | Overlay on any family | +1 rarity tier | Same as host family | night / fog / rain / blossom variants |

### 7.2 Deterministic spawning (shared and sparse)
- `seed = hash(place_id, yyyy-mm-dd, condition_bucket)`. The server and client compute the same result, so no spawn table needs storing.
- Trees: base chance ~5%, raised by age (DBH and plant date) and by "notable/landmark tree" status. The oldest ~1% of trees always host a spirit (the rarest ones).
- Businesses, art, landmarks and films: always host their spirit (they are already sparse).
- Condition spirits: if the condition is active and the place qualifies (flowering species in spring → blossom; coastal or western neighborhood + fog → fog; any place + rain → rain; night → night variants), a second roll spawns the condition variant.
- Everyone sees the same spirit at the same place on the same day. Per-player state (cooldown, trust, friendship) lives in Postgres.

### 7.3 Identity and generation (lazy + cached)
On the first encounter with a `spirit_id` that is not yet in the `spirits` index:
1. Retrieve the grounding: the place doc plus up to 5 nearby places (for local color) and the neighborhood.
2. Call `mistral-large-latest` in **JSON mode** with a schema-validated output: `name`, `persona`, `temperament` (shy|wary|calm|curious|bold → starting trust), `voice_notes`, `wish {keepsake_type, theme, riddle_1, riddle_2}`, `lore.chapters[3]`, and `minigame_content` for its family.
3. Run the wish linking (§6.2) to set `target_place_ids`.
4. Run the moderation pass, then write to ES.
5. Use a lock (an ES `op_type=create` doc or Postgres advisory lock) so two players meeting the same new spirit don't generate it twice.

**Pre-warm for the demo:** run a script that generates the showcase-neighborhood spirits and the demo-path spirits ahead of time, so the stage demo never waits on a cold generation. Generation still happens lazily everywhere else.

**Live greeting:** `mistral-small-latest`, streamed. Input: the cached persona, the current conditions (time, weather), the player's friendship history with this spirit, and whether this is a revisit. Max ~60 words. Fallback: a templated greeting from `voice_notes` if no response after 2.5 s.

### 7.4 Procedural sprites
- Each family has a base body (24×24 or 32×32) with 2–4 idle frames.
- Layered parts are chosen by `sprite_seed`: eyes, mouth, a crown or ears (leaf shape by species group for trees, a shop-category hat for shopkeepers, a film-reel halo for echoes), and an aura for condition variants.
- **Palette from data:** tree species → a foliage and bark palette table, artwork → a palette from Mistral's description of the work (or real image colors when an image URL exists), business category → a palette, landmark → sepia tones.
- Built at runtime into a Phaser texture and cached. **Rare friendship forms** add an extra part and an animated aura.

---

## 8. Encounter: meet → play → gift

### 8.1 State machine
`idle → approach (within 3 tiles; spirit notices you) → meet → play → result → gift (optional) → befriended | wandered`

### 8.2 Trust math
- **Starting trust** by temperament: shy 10, wary 20, calm 30, curious 45, bold 55.
- **Play:** the mini-game score (0–1) × 60 is added to trust.
- **Gift:**
  - Wished-for keepsake: **+40**, and the friendship becomes **rare** (unlocks a special form plus a secret lore chapter).
  - Any other keepsake of the same family theme: +10.
  - An unrelated keepsake: +0, with a polite in-character decline (the keepsake is kept).
- **Befriended at ≥ 100.** So common, curious spirits can be won with a near-perfect game alone, while shy and rare spirits need the gift. Rarity also raises the game difficulty (§9), so legendaries effectively always need the wish.
- **Fail (trust < 100 after play, and no gift is given or the gift is short):** the spirit "wanders off" **for this player only** for 10 min (legendary: 30 min). Earned trust is kept, so the player only needs the gift next time. The rest of the encounter plays out as normal for other players.

### 8.3 Wish hints → Atlas
- Each spirit has two riddles. The first plays during "meet". The second plays on a revisit or after a failed attempt.
- After **both** riddles have been heard, the Atlas marks an open wish and softly glows the neighborhood(s) containing any `target_place_id`. It never shows the exact spot.
- Picking up the matching keepsake shows a subtle "♪ someone would love this" toast.

### 8.4 Revisits (deepening friendships)
- Visiting a befriended spirit's home again (cooldown 24 h per spirit) unlocks the next lore chapter. Sometimes (≈30%) this triggers a **new wish**, which awards bonus Atlas stars and companion XP when fulfilled.

---

## 9. Mini-games (all five in the demo; each lasts under 60 s)

Shared rules: a short intro card, a 3-2-1 countdown, then a score from 0 to 1. Difficulty `d` ∈ [0, 1] comes from rarity (common 0.1, uncommon 0.3, rare 0.55, legendary 0.85), plus family-specific inputs. Inputs: tap/click, space bar, and number keys or arrows. Each game is a separate Phaser scene that receives `minigame_content`. Reduced-motion and colorblind-safe variants are required.

1. **Tree rhythm ("Rustle").** Beat notes scroll toward a hit line, with sound cues for rustle (tap) and creak (hold). BPM = 70 + (tree age in decades × 6), capped at 150, plus `d`. Species flavors the soundscape (ginkgo = light chimes, Monterey cypress = deep wood creaks). The score is hit accuracy. Audio: a small set of sampled rustle, creak and wind loops.
2. **Shopkeeper memory ("Rush Hour").** The spirit shows an order of 3–6 of its shop's specialties (from Mistral and the business category, for example a bakery → conchas, sourdough, cardamom bun). Items then fall or slide in, and you catch and serve them in order before each cools down (a per-item timer bar). Sequence length and speed scale with `d`.
3. **Ancient "Then or Now".** Three to five rounds. Each round shows a historical clue about the block, written by Mistral and grounded in the landmark's designation text and year, and you pick what stands there today from four options. The options are **real nearby places from ES** (the correct one plus three distractors within 300 m), so the answers are factual.
4. **Echo film trivia ("Take Two").** Five rapid questions with a 6 s timer each (shorter at high `d`). Questions are grounded **only** in the film row: title, year, director, actors, writer, the "fun facts" field and the location. Mistral turns those facts into questions; it never invents facts.
5. **Art guardian pattern puzzle ("Mosaic").** Generated from the artwork's palette and dominant shapes (taken from Mistral's structured read of title, medium and description). Mechanics: a sliding or rotating tile grid that must match a target pattern, which grows from 3×3 to 5×5 with `d`, with a move or time budget. Solving it reveals the guardian's full story (artist, title, year and history from the dataset, voiced by the guardian).

---

## 10. Keepsakes

- **A keepsake table maps place kinds and tags to keepsake types**, for example: oak → acorn, ginkgo → golden fan leaf, cypress → cypress cone, beach (Ocean Beach polygon) → sea shell, bakery → crumb, bookstore → dog-eared page, cafe → coffee bean, Twin Peaks / summits + fog + dawn → scrap of fog, any flowering tree in spring → petal, film location → film ticket stub, mural or art → paint chip, landmark → old brass key.
- **Pickups:** a deterministic glint near matching places, seeded by `hash(chunk, 2-hour window)`, about 1–3 glints per chunk. They are collected by walking over them. Each player gets the same glint only once per window (tracked in Postgres).
- **Condition-gated keepsakes** (fog scrap, rain drop, moon dust at night, petal in spring) are what make the real-world conditions matter.
- **Exclusive keepsakes:** some types exist only in specific neighborhoods (sea shell: Outer Richmond / Outer Sunset coast). This is what drives cross-neighborhood trading.
- The inventory has stack caps (for example 20 per type) so that trading stays meaningful.

---

## 11. Content guardrails (Claude's decision)

All four layers are on.
1. **Grounded facts only.** Prompts contain only retrieved data, and the system prompt says: "You may invent your own personality and feelings. You may not invent facts about real people, businesses, artworks, films or events. If a fact is not in CONTEXT, do not state it." Trivia and Then-or-Now answers are built from dataset fields or ES results, never from model memory.
2. **Warm about real entities.** Spirits never criticize, review or rate a business, artist, film, person or neighborhood. They never mention crime, homelessness or 311 problems as character traits; the haze is visual only. They give no health, safety or legal claims and no prices or opening hours (which could be stale), only "go see them".
3. **Structured output.** Mistral JSON mode plus `zod` validation, one retry on parse failure, then a templated fallback built from dataset fields. Hard length caps per field.
4. **Moderation.** Every generated text runs through Mistral's moderation endpoint before it is cached. Flagged text is regenerated once, then the template is used. The moderation result is stored on the spirit doc.
- Kill switch: a `spirit_id` blocklist (admin-editable) that forces the template content.
- Prompt-injection hygiene: dataset text (business names, film fun facts) is wrapped as data in the prompt, never as instructions.

---

## 12. Live world signals (all in the demo)

| Signal | Source | Refresh | Effect |
|---|---|---|---|
| Day/night | `suncalc` for SF + server clock (America/Los_Angeles) | Live | Night variants after sunset, lamp glow |
| Fog | Open-Meteo current: `visibility` < 3 km or low cloud cover > 70% with humidity > 90% | 15 min, cached server-side | Fog overlay; fog spirits mostly in the west and on summits; fog-scrap keepsakes at dawn |
| Rain | Open-Meteo `precipitation` > 0 | 15 min | Rain particles, rain spirits |
| Blossom | Month in Feb–May + flowering species tag (Prunus, Magnolia, Pyrus, and others) | Daily | Blossom variants at flowering trees |
| New business | Business dataset location start date in the last 30 days | Daily cron | Rare "grand opening" shopkeeper with a sparkle marker for 14 days |
| Daily featured rare | Deterministic pick from rare/legendary places, biased toward under-visited neighborhoods | Daily at 06:00 PT | Banner plus an Atlas compass hint (neighborhood only) |
| 311 haze | Open cases per km² per neighborhood, normalized to 0–1 (p10–p90), recent closures lower the score | Hourly cron | Haze overlay; the Atlas shows "the haze is lifting" when the score drops |

**Dev conditions panel** (enabled by `?dev=1` or demo mode): force night, fog, rain or spring; jump to the featured rare; grant keepsakes; teleport between showcase neighborhoods. It is essential for the stage demo, because real weather won't cooperate.

---

## 13. Player progression

### 13.1 Onboarding (about 60 s)
1. Sign in (Supabase: email magic link, plus a guest option that can upgrade later).
2. Pick a home neighborhood from a map, which sets the crew.
3. Pick a companion from 3 starters: **Mote** (a fog wisp), **Sprig** (a sapling), **Tidepip** (a sea sprite).
4. Spawn at a park in the home neighborhood, with a guided first encounter against a guaranteed curious common tree spirit.

### 13.2 Companion evolution
- XP comes from new neighborhoods explored, friends made, wishes fulfilled and revisits.
- Three forms (stages at, for example, 3 neighborhoods + 5 friends, then 8 neighborhoods + 20 friends).
- **Trait absorption:** the top 2 neighborhoods by time explored add cosmetic parts (coastal → shell, Mission → mural colors, and so on).
- The companion follows the player, reacts to nearby spirits (a radar wiggle) and comments with short lines (templated, with occasional Mistral lines).

### 13.3 Milestone unlocks (demo mode unlocks all)
| Unlock | Requirement |
|---|---|
| Explore, befriend, companion, Atlas | Start |
| Crew board | 2 neighborhoods explored |
| Trading | 5 friends |
| Gatherings | 10 friends |
| Profiles visible to others | Same time as trading |

The HUD always shows **one next goal** ("Befriend 2 more spirits to unlock trading").

### 13.4 Spirit Atlas
Tabs:
- **Friends**: grid by family, with silhouettes for spirits not yet met in visited neighborhoods.
- **Keepsakes**
- **Map**: neighborhood fog-of-war showing explored %, open-wish glows, haze, and the featured-rare hint.
- **Wishes**: open and fulfilled.

The map never shows exact positions of undiscovered spirits.

---

## 14. Social

### 14.1 Crews and weekly board
- The crew is the player's home neighborhood (it can change once per 30 days).
- Weekly score = new chunks explored + friends made + wishes fulfilled (weighted), normalized by active members so small neighborhoods can compete.
- The week resets Monday 00:00 PT. It is a Postgres materialized view refreshed every 10 min.
- Board UI: the top 10 crews plus your crew's rank and a contribution breakdown.

### 14.2 Trading
- Players can trade keepsakes in v1, and *spirits are not tradable* (friendships are personal). Spirit trading is a long-term open question.
- Flow: find a player by handle or from a gathering roster → propose items → the other player accepts or counters → a Postgres function (`execute_trade`) swaps the items atomically within a single transaction, with row locks and inventory checks.
- Limits: 10 trades per day and no more than 5 of one item per trade, to discourage farming.

### 14.3 Gatherings (multiplayer rare spirit)
- An `events` doc describes the event: place (a public venue such as a farmers market, park or plaza; *never* a residential address), time window, rare spirit and `min_players` (3 for the demo).
- **Real check-in:** the browser Geolocation API with `enableHighAccuracy`. The check-in is accepted only if the player is within 150 m of the venue, the accuracy is under 100 m, and the time is inside the window. The server re-validates. The check-in result is stored as a boolean, and **raw coordinates are not stored**.
- **Lobby:** a Supabase Realtime channel `gathering:<event_id>`. It shows the count and the profile cards of players who are checked in, and it **never shows positions**.
- **Co-op mini-game:** the family's game in co-op mode (for example co-op rhythm, where each player gets a lane). The team score is the average, and success befriends the spirit for everyone present.
- Demo override: a host/dev flag skips the GPS radius check (shown as "DEMO CHECK-IN").

### 14.4 Profiles
Show: handle, companion (current form), 3 favorite spirits, home neighborhood, and Atlas stats. They are visible to others only after the trading unlock.

### 14.5 Safety
- **No other player's location is ever sent to clients**, live or historical. The API never returns positions of other players, and there is no "players near you" feature.
- Player positions are not persisted beyond the explored-chunk bitset.
- Handles are moderated with a name filter and the Mistral moderation endpoint. Players can block and report.
- Gathering venues are curated from public places only.

---

## 15. Data model (Supabase Postgres)

```
profiles(id uuid pk = auth.uid, handle, home_hood, companion_species, companion_form, companion_xp,
         favorite_spirits text[], created_at, demo_mode bool)
friendships(player_id, spirit_id, place_id, family, rarity, trust, status [met|befriended|rare],
            lore_unlocked int, met_at, befriended_at, last_visit_at, pk(player_id, spirit_id))
encounter_cooldowns(player_id, spirit_id, until)
wish_progress(player_id, spirit_id, riddles_heard int, fulfilled_at)
inventory(player_id, keepsake_type, qty, pk(player_id, keepsake_type))
pickups_claimed(player_id, glint_id, window_start)  -- glint_id deterministic
explored_chunks(player_id, chunk_key, first_at, last_at)   -- or a bitset per hood
trades(id, from_id, to_id, offer jsonb, request jsonb, status, created_at, resolved_at)
crew_week_scores (materialized view)
gathering_checkins(event_id, player_id, checked_in_at, verified bool)
reports/blocks
```
RLS: players read and write only their own rows. Trades are visible to both parties. Profiles are public-read after the unlock.

**Authority:** the server (API routes using the service role) computes trust outcomes and inventory changes. The client sends inputs and mini-game results with a signed per-encounter token, and the server sanity-checks scores against the game duration. Hackathon level: basic checks; later: a replay log.

---

## 16. API surface (Next.js route handlers)

```
GET  /api/world?chunks=cx_cy,…&date= -> entities + active spirits (+ glints in D) per chunk; each chunk cached by (chunk, date)
GET  /api/conditions              -> {isNight, fog, rain, blossom, sunrise, sunset} (cached 15 min)
POST /api/encounter/start         {spirit_id} -> persona, greeting stream URL, trust_start, token
GET  /api/encounter/greet?token=  -> SSE stream (mistral-small)
POST /api/encounter/play          {token, score, duration} -> new trust
POST /api/encounter/gift          {token, keepsake_type} -> outcome
POST /api/pickup                  {glint_id}
GET  /api/atlas                   -> friends, keepsakes, explored, open wishes (+ glow hoods)
GET  /api/featured                -> daily rare (hood hint)
GET  /api/crews/board
POST /api/trades | POST /api/trades/:id/accept | /counter | /cancel
GET  /api/gatherings/active ; POST /api/gatherings/:id/checkin {lat, lon, accuracy}
GET  /api/profile/:handle
cron: /api/cron/refresh-311 (hourly), /api/cron/new-business (daily), /api/cron/featured (daily)
```

---

## 17. Build plan (solo + Claude, demoable at each checkpoint)

**Step 0: Setup (you + Claude, ~30 min).** Collect keys (§18). Scaffold Next.js + Phaser + Tailwind + Supabase + ES clients. Find the DataSF IDs for civic art and landmarks.
**Checkpoint A, "Walk the city".** Bake terrain chunks for the whole city. Phaser player movement with keyboard and touch joystick, camera, collision, neighborhood title cards, and minimap.
**Checkpoint B, "The city is alive".** Ingest trees, businesses, film, parks, art, landmarks and neighborhoods into ES. `/api/world` streams entities per chunk. Deterministic spirits are visible with procedural sprites.
**Checkpoint C, "Meet a spirit".** Encounter UI, Mistral persona generation with lazy cache and guardrails, streamed greeting, trust meter, and the tree rhythm game end to end. Supabase auth and friendships persist.
**Checkpoint D, "Gifts and quests".** Keepsake glints and inventory, wishes with hybrid ES linking, riddles, Atlas with wish glow. Demo the Tenderloin → Ocean Beach shell quest.
**Checkpoint E, "Every family".** Shopkeeper memory, Then or Now, film trivia, art Mosaic.
**Checkpoint F, "Living world".** Conditions (Open-Meteo, suncalc), condition spirits, 311 haze, new-business spirits, daily featured rare, and the dev conditions panel.
**Checkpoint G, "Together".** Onboarding with crew and companion, companion evolution, milestone unlocks, crew board, trading, profiles, and a gathering with real check-in and a co-op mini-game.
**Checkpoint H, "Demo polish".** Pre-warm the showcase spirits, write the demo script and route, sound pass, loading states, a mobile pass, and deploy to Vercel.

If time runs short, cut from the end of G (gathering co-op becomes a single-player-with-count fallback, then profiles) before touching A–F.

---

## 18. What I need from you (Step 0)

Put these in `.env.local` (never commit it; I'll add `.env.example`):

**Elastic Cloud**
- `ELASTICSEARCH_URL`: the deployment's Elasticsearch endpoint (Cloud console → your deployment → "Elasticsearch" endpoint → Copy), *or* `ELASTIC_CLOUD_ID`.
- `ELASTICSEARCH_API_KEY`: Kibana → Stack Management → API keys → Create, with privileges on indices `places*`, `spirits*`, `neighborhoods*` and `events*` (all privileges for the hackathon).
- Tell me whether it's a hosted deployment or Serverless (this affects RRF/retriever availability).

**Mistral**
- `MISTRAL_API_KEY`: console.mistral.ai → API Keys. Confirm that billing or a plan is active (the free tier's rate limits could throttle generation).

**Supabase** (create a project if you haven't)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API).
- `SUPABASE_SERVICE_ROLE_KEY` (server only).
- Enable Email auth (magic link) and Anonymous sign-ins.

**Optional**
- `SOCRATA_APP_TOKEN`: free from data.sf.gov (developer settings). Raises DataSF rate limits.
- A Vercel account linked to the GitHub repo, for deployment.

---

## 19. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Tile bake for the whole city takes too long or looks noisy | Start with low-detail terrain classes (road, sidewalk, grass, water, sand, building). Bake showcase neighborhoods at higher detail. Chunk-level caching |
| Mistral latency during the live demo | Pre-warm the showcase spirits, stream greetings, use template fallbacks |
| Film locations lack coordinates | Geocode at ingest (Nominatim with rate limiting, or a geocoder with a key) and cache; skip rows that fail |
| Art and landmark datasets are missing on the new portal | OSM `tourism=artwork` / `historic=*` fallback |
| Real weather is boring on demo day | Dev conditions panel |
| Gatherings are hard to demo with one person | Demo check-in override plus two or three browser sessions or phones |
| Scope (all five games plus all social) is large for a day | Checkpoint order and the cut list in §17 |
| Spirits saying something wrong about a real business | §11 guardrails plus the blocklist kill switch |

---

## 20. Long-term roadmap (post-hackathon)

- Bring every neighborhood to showcase density; a curated species list per park biome.
- Native mobile (Capacitor first), push notifications for the featured rare, gatherings and new shops nearby.
- Optional in-person bonuses (shopkeeper "visited in person" badge via check-in), always opt-in.
- Business partnerships (claim your shop's spirit) with editorial review, never pay-to-feature over organic discovery.
- Spirit-to-spirit relationships and multi-spirit story arcs across neighborhoods.
- Seasonal events tied to real SF calendars (Carnaval, Fleet Week, Bay to Breakers, Lunar New Year).
- Anti-cheat replay validation; moderation tooling; a full accessibility audit.
- Move ingest and cron to a dedicated worker; ES data streams for 311 history ("this block got better" stories).

## 21. Open questions (not blocking Stage 1)
- Should spirits ever be tradable, or only keepsakes? (v1: keepsakes only)
- Crew switching rules and how to handle neighborhoods with very few players.
- Do gatherings need host curation (manual) or auto-scheduling from venue lists? (v1: manually seeded events)
- Audio direction: chiptune vs ambient field recordings of SF.
