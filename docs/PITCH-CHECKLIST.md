# SF Spirits: Pitch ↔ Build Consistency Checklist

Status as of the hackathon build (2026-11-03). ✅ working · ⚠️ partial · ❌ not built.
Everything marked ✅ was exercised end to end (API + browser) before writing this.

## Core loop (must work)
| | Claim | Notes |
|---|---|---|
| ✅ | Real SF map shows one neighborhood | The **whole city** is walkable (OSM terrain baked into 2,098 chunks); 41 DataSF neighborhoods with title cards on entry. Demo starts in the Mission. |
| ✅ | Player moves with arrow keys / joystick | WASD/arrows (+Shift jog) and a floating touch joystick. Collision on buildings and water. |
| ✅ | Spirits appear on the map from real data | Every spirit is anchored to an Elasticsearch `places` doc (tree/shop/film/art/landmark/park). Spawns are a deterministic daily hash; nothing hardcoded. |
| ✅ | Clicking / approaching a spirit opens an encounter | Within ~10 m a "Meet" prompt appears: E / Space / Enter, click the spirit, or tap the prompt on mobile. |
| ✅ | Mistral-generated personality based on its real record | `mistral-large-latest`, JSON mode, grounded in the place's dataset fields + nearby places from ES. Cached in ES after first meeting. Falls back to a template if Mistral is rate-limited (shows `model: template` in ES). |
| ✅ | At least one mini-game works end to end | **Rustle** (rhythm) for trees, shops, art, landmarks, parks; **Take Two** (film trivia) for film echoes. Server scores trust from the result. |
| ✅ | Befriended spirit is saved to the Spirit Atlas | Supabase Postgres (`friendships`, RLS). Atlas (B) shows Friends / Met / Wishes with lore. Guest account per device. |

## Data sources (only claim what's indexed)
| | Claim | Notes |
|---|---|---|
| ✅ | Street trees indexed | 134,668 (DataSF `tkzw-k3nq`) |
| ✅ | Public art indexed | 892 (Civic Art Collection `r7bn-7v9c` + StreetSmArts murals `wg8w-68vc`) |
| ✅ | Registered businesses indexed | 9,163 consumer-facing, open, located (filtered from ~100k, `g8m3-pdis`) |
| ✅ | Landmarks indexed | 351 Article 10 landmarks (`rzic-39gi`) |
| ❌ | Mistral OCR on landmark reports | **Remove from pitch.** We use the landmark dataset's structured fields only. |
| ❌ | Our415 events indexed | **Remove from pitch** (no gatherings). |
| ❌ | 311 cases indexed | **Remove from pitch** (no city haze). |
| ⚠️ | All indices have a geo_point field | `places.location` is `geo_point` (all 148k docs). `neighborhoods` uses `geo_shape`. `spirits` is keyed to places by `place_id` (no own point). Say "every place is geo-indexed". |
| ✅ (bonus) | Film locations, parks, neighborhoods | 2,110 film rows, 252 parks, 41 neighborhood polygons. |

## Elastic (must be showable on screen)
All saved in `elastic/demo-queries.console` (paste into Kibana Dev Tools). `npx tsx scripts/check-demo-queries.ts` re-runs them all.
| | Claim | Query # |
|---|---|---|
| ✅ | `geo_distance` "spirits near me" | #1, 150 m radius, distance sort, all datasets |
| ✅ | Cross-dataset geo join | #2: other datasets within 200 m of a tree (the grounding query used before Mistral writes a spirit); #2b: ancient trees → nearby cafés |
| ✅ | Aggregation | #3a places per neighborhood × dataset; #3b spirits awakened per neighborhood × family; #3c ancient trees per neighborhood. (No crew score.) |
| ✅ | Semantic / hybrid search | #4: BM25 + kNN on `mistral-embed` vectors, fused with **RRF**, query embedded inside ES via a `mistral-embed` inference endpoint. Used live to link each spirit's wish to target places. Caveat: vectors exist for non-tree places (~13k); trees match lexically. |

## Mistral (name the exact model / API)
| | Claim | Notes |
|---|---|---|
| ✅ | Model that writes spirit dialogue | **`mistral-large-latest`** writes the spirit card (name, persona, greeting, riddles, lore). **`mistral-small-latest`** streams the live greeting at each meeting. **`mistral-embed`** for vectors, **`mistral-moderation-2603`** for moderation. |
| ✅ | Structured output turns a raw record into a spirit card (JSON) | `responseFormat: json_object` + zod schema, one retry, template fallback. |
| ⚠️ | Mini-game trivia/riddles generated from real data | **Riddles**: Mistral, from grounded context. **Trivia**: built directly from the film dataset row (year, director, actors, location) with distractors from other real films. **Not** written by Mistral, so it can't hallucinate. Say "trivia from the city's film records". |
| ❌ | OCR on landmark reports | **Remove from pitch.** |
| ✅ | Prompts use real fields only | System prompt forbids invented facts about real entities, no reviews, crime, prices or hours. Dataset text is wrapped as data. Every card passes Mistral moderation before caching. Caveat: lore can include *invented sensory memories* ("the block smelled of roasted chiles"), which is spirit flavor, not stated facts. Say "grounded in real records", not "every sentence is a fact". |

## Demo safety
| | Claim | Notes |
|---|---|---|
| ✅ | Rehearsed path walk → find → encounter → befriend | See `docs/DEMO.md`. |
| ✅ | Cached / pre-run Mistral fallback | `scripts/prewarm.ts` generates the route's spirits ahead of time. Greeting falls back to the cached line after 2.5 s. Template card if Mistral is down. |
| ✅ | Dev Tools tab with Elastic queries ready | `elastic/demo-queries.console`, all verified. |
| ✅ | Nothing shows another player's live location | No API returns player positions; positions aren't stored. |

## Pitch claims: built vs. roadmap
| Claim | Say |
|---|---|
| Gift / wish quests | **Partly built.** Every spirit has a wish + two riddles. Hybrid search links the wish to real places, and the Atlas glows those neighborhoods after both riddles. **Collecting and gifting keepsakes is roadmap.** |
| Weather spirits ("rain tonight") | **Roadmap** |
| New-business spirits | **Built (light):** shops that opened in the last 14 days spawn as *rare* "grand opening" shopkeepers from live DataSF dates (38 right now). Sparkle marker and daily cron are roadmap. |
| Companion evolution | **Roadmap** |
| Neighborhood crews | **Roadmap** |
| Trading | **Roadmap** |
| Gatherings at real events | **Roadmap** |
| City haze from 311 | **Roadmap** |
| Day/night | **Roadmap** |
| Shopkeeper memory game, Then-or-Now, art Mosaic | **Roadmap** (those families use the rhythm game for now) |
