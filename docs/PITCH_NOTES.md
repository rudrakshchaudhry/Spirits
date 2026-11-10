# SF Spirits: Pitch Notes (Elastic × Mistral SF Hack Night)

Everything below is checked against the code in this repo. If it isn't listed as ✅, don't demo it.

---

## 1. Built vs. not built

| Feature | Status | What actually works |
|---|---|---|
| Real SF map, open world | ✅ | Whole city walkable: OpenStreetMap streets/buildings/water baked into 2,098 map chunks. 41 DataSF neighborhoods with a title card on entry. City map on **M**. |
| Joystick / keyboard movement | ✅ | WASD/arrows (+Shift), touch joystick on phones. Collision with buildings and water. |
| Spirits from SF open data | ✅ | Every spirit sits on a real record in Elasticsearch: street trees, businesses, film locations, public art, landmarks, parks. |
| Street trees | ✅ | 134,668 (DataSF `tkzw-k3nq`) |
| Public art | ✅ | 892 (Civic Art `r7bn-7v9c` + StreetSmArts murals `wg8w-68vc`) |
| Landmarks | ✅ | 351 Article 10 landmarks (`rzic-39gi`) |
| Local businesses | ✅ | 9,163 open, consumer-facing shops (cafés, bakeries, restaurants, bars, salons, bookstores…), filtered from ~100k registrations (`g8m3-pdis`) |
| Parks | ✅ | 252 Rec & Park properties (`gtr9-ntp6`) |
| Film locations (bonus) | ✅ | 2,110 rows (`yitu-d5am`), become "film echo" spirits |
| Events | ❌ | Not ingested (an empty `events` index exists, unused) |
| 311 | ❌ | Not ingested |
| Nature observations | ❌ | Not built |
| Meet a spirit (approach → encounter) | ✅ | Prompt within ~10 m; E/Space/click/tap opens it |
| Mistral-written personality from real data | ✅ | Name, persona, temperament, greeting, wish + 2 riddles, 3 lore chapters |
| Mini-games | ✅ (2 of 5) | **Rustle** rhythm game (trees, shops, art, landmarks, parks); **Take Two** film trivia (film spirits) |
| Befriend + Spirit Atlas | ✅ | Trust scored on the server, saved in Supabase; Atlas (**B**) with Friends / Met / Wishes + lore |
| Gift / wish quests | ⚠️ | Every spirit has a wish + riddles; Elastic hybrid search links the wish to real places in *other*, under-visited neighborhoods; the Atlas names those neighborhoods after you hear both riddles. **Collecting and giving gifts is not built.** |
| New-business spirits | ⚠️ | Shops that opened in the last 14 days (from live DataSF dates) spawn as *rare* "grand opening" spirits (38 right now). No special marker or daily job yet. |
| Returning visits | ✅ | Trust is kept between visits; revisiting a friend unlocks the next lore chapter; second riddle on revisit; tree spirits reshuffle every day |
| Weather spirits | ❌ | Roadmap |
| Companion evolution | ❌ | Roadmap |
| Neighborhood crews | ❌ | Roadmap |
| Trading | ❌ | Roadmap |
| Gatherings at real events | ❌ | Roadmap |
| 311 "city haze" | ❌ | Roadmap |
| Day/night | ❌ | Roadmap |
| Deployed online | ❌ | Runs locally (`npm run dev`) |

---

## 2. The exact tech

### Elastic (hosted Elasticsearch 9.5, enterprise trial license)

**Indices**
| Index | Docs | What's in it |
|---|---|---|
| `places` | 147,436 | Every real-world anchor, one schema with a `kind` field: tree, business, film, art, landmark, park |
| `spirits` | 54 so far | Cache of Mistral-generated spirit cards, keyed by place (`<place id>:base`) |
| `neighborhoods` | 41 | DataSF Analysis Neighborhood polygons (`j2bu-swwd`) |
| `events` | 0 | Created, not used |

**`places` mapping, key fields** (`lib/es/mappings.ts`)
- `location`: **`geo_point`** (every place)
- `shape`: `geo_shape` (parks, landmarks)
- `embedding`: **`dense_vector`, 1024 dims, cosine** (12,768 non-tree places embedded with `mistral-embed`)
- `kind`, `neighborhood`, `tags`, `keepsake_types`: `keyword`
- `name`, `description`: `text` (BM25)
- `rank`: `float` (how notable: tree size/age, shop age)

**Query types used in the app (file → function)**
| Query | Where | What it does |
|---|---|---|
| `geo_bounding_box` | `lib/world/chunkQuery.ts` → `queryChunk` | Streams every place in the 256 m map square around the player (served by `GET /api/world`) |
| `geo_distance` + `_geo_distance` sort (**cross-dataset join**) | `lib/spirits/card.ts` → `nearbyPlaces` | Finds places from *other* datasets within 200 m (e.g. shops next to a tree) and gives them to Mistral as local context |
| **Hybrid: BM25 + kNN, fused with `rrf` retriever**, plus `function_score` (gauss distance decay, boost for under-visited neighborhoods) | `lib/spirits/card.ts` → `linkWish` | Matches a spirit's wish to 3 real places elsewhere in the city |
| `function_score` + `random_score` | `lib/encounter/games.ts` → `triviaFor` | Picks other real films as wrong answers for trivia |
| `op_type: create` lock | `lib/spirits/card.ts` → `createCard` | Makes sure two players meeting a new spirit don't generate it twice |
| `bulk`, `delete_by_query`, `mget` | `scripts/ingest/*`, `app/api/atlas/route.ts` | Ingest + prune closed shops/removed trees; load wishes for the Atlas |
| **Inference endpoint** `mistral-embed` (`service: mistral`) | Elastic `_inference` API | Embeds query text *inside* Elasticsearch, used by the Dev Tools hybrid query |
| Aggregations (`terms`) | `elastic/demo-queries.console` #3 | Shown in Dev Tools (places per neighborhood, spirits per neighborhood). **Not used by a game feature.** |

Not used: **ES|QL**, **Agent Builder**.

**Key queries to show in Dev Tools** (all in `elastic/demo-queries.console`; `npx tsx scripts/check-demo-queries.ts` re-runs them)

#1 "Spirits near me": every dataset, 150 m, nearest first
```
GET places/_search
{
  "size": 15,
  "_source": ["name", "kind", "neighborhood"],
  "query": { "bool": { "filter": { "geo_distance": { "distance": "150m", "location": { "lat": 37.7590, "lon": -122.4212 } } } } },
  "sort": [{ "_geo_distance": { "location": { "lat": 37.7590, "lon": -122.4212 }, "order": "asc", "unit": "m" } }]
}
```

#2 Cross-dataset geo join: the exact grounding query run before Mistral writes a spirit
```
GET places/_search
{
  "size": 5,
  "_source": ["name", "kind"],
  "query": { "bool": {
    "filter": [{ "geo_distance": { "distance": "200m", "location": { "lat": 37.75731, "lon": -122.41987 } } }],
    "must_not": [{ "term": { "kind": "tree" } }] } },
  "sort": [{ "_geo_distance": { "location": { "lat": 37.75731, "lon": -122.41987 }, "order": "asc", "unit": "m" } }]
}
```

#3a Aggregation: what lives in each neighborhood
```
GET places/_search
{ "size": 0,
  "aggs": { "hoods": { "terms": { "field": "neighborhood", "size": 41 },
                       "aggs": { "kinds": { "terms": { "field": "kind" } } } } } }
```

#4 Hybrid wish search: BM25 + mistral-embed kNN, fused with RRF
```
GET places/_search
{
  "size": 3,
  "_source": ["name", "kind", "neighborhood"],
  "retriever": { "rrf": { "retrievers": [
    { "standard": { "query": { "bool": {
        "filter": [{ "term": { "keepsake_types": "film_ticket_stub" } }],
        "should": [{ "multi_match": { "query": "a love story by the bay", "fields": ["name^2", "description", "tags^2"] } }],
        "must_not": [{ "term": { "neighborhood": "Mission" } }] } } } },
    { "knn": { "field": "embedding",
        "query_vector_builder": { "text_embedding": { "model_id": "mistral-embed", "model_text": "a love story by the bay" } },
        "k": 20, "num_candidates": 200,
        "filter": { "bool": { "filter": [{ "term": { "keepsake_types": "film_ticket_stub" } }],
                              "must_not": [{ "term": { "neighborhood": "Mission" } }] } } } }
  ], "rank_window_size": 50 } }
}
```
Mapping to show: `GET places/_mapping/field/location,embedding,shape`

### Mistral
| Model / API | What it does | Where |
|---|---|---|
| **`mistral-large-latest`**, `chat.complete` with **`responseFormat: json_object`** | Turns a raw city record + its neighbors into a **spirit card** (JSON: name, persona, temperament, greeting, wish, 2 riddles, 3 lore chapters). Validated with a zod schema; one retry; template fallback. | `lib/spirits/card.ts` → `generateContent` (called by `getOrCreateCard`) |
| **`mistral-small-latest`**, `chat.stream` | **Live greeting**, streamed word by word, aware of time of day; falls back to the cached greeting after 2.5 s | `app/api/encounter/greet/route.ts` → `GET` |
| **`mistral-embed`**, `embeddings.create` | 1024-d vectors for 12,768 places, and for each wish theme at search time | `scripts/embed-places.ts`; `lib/spirits/card.ts` → `linkWish` |
| **`mistral-embed` via Elastic inference endpoint** | Same model, called by Elasticsearch itself for the Dev Tools hybrid query | Elastic `_inference/text_embedding/mistral-embed` |
| **`mistral-moderation-2603`**, `classifiers.moderate` | Every generated card is moderated before it's cached; flagged text is regenerated | `lib/mistral/client.ts` → `flagged` |

Not used: OCR, vision, agents, Vibe CLI.

Guardrails (system prompt in `lib/spirits/card.ts`): spirits may invent their own feelings, but **not facts** about real businesses, people, films or art; no reviews, crime, prices or opening hours; city data is wrapped as data, not instructions.

---

## 3. 2-minute pitch (~1:45 spoken)

**0:00–0:15 · Who it helps**
- SAY: "San Franciscans walk the same five blocks every day. Meanwhile the city has 134,000 street trees, 9,000 small shops and hundreds of landmarks most of us never notice. SF Spirits turns them into reasons to go explore."
- SHOW: Game on Valencia St (Mission). Trees, shop signs and spirits on screen.

**0:15–0:35 · What it is**
- SAY: "It's an open-world game on the real map of SF. Every spirit lives at a real place from DataSF: a palm tree, a bakery, a mural, the spot where a film was shot. You find them, play a short game, and befriend them."
- SHOW: Walk down Valencia. Press **M** for the whole-city map for 2 seconds, then **Esc**.

**0:35–1:05 · Mistral demo**
- SAY: "This is Tumble, the spirit of a 1984 film shot right here. Mistral Large wrote Tumble from the real film record as structured JSON: personality, a wish, riddles. The greeting is streaming live from Mistral Small, and every card passes Mistral moderation."
- SHOW: Walk to the film-reel ghost at Valencia & 20th. Press **E**. Let the greeting stream. Point at the riddle. Press **Enter**, answer 2 trivia questions ("1984", "Louis Malle").
- SAY (during trivia): "The trivia comes straight from the city's records, so it can't make things up."

**1:05–1:25 · Elastic demo**
- SAY: "All 147,000 places live in one Elastic index with a geo_point and a Mistral vector. Before Mistral writes a spirit, a geo query finds its real neighbors. And a hybrid search, keywords plus Mistral embeddings fused with RRF, links each spirit's wish to a place in a neighborhood you probably haven't visited."
- SHOW: Switch to Kibana Dev Tools. Run **#2** (neighbors within 200 m), then **#4** (hybrid wish search).

**1:25–1:40 · Why people come back**
- SAY: "Friends go into your Spirit Atlas. Trust carries over between visits, revisits unlock more of each spirit's story, tree spirits change every day, and new shops show up as rare spirits within two weeks of opening. Next: gifts, crews and trading."
- SHOW: Back to the game. Finish the trivia → "Tumble is now your friend!" Press **B** for the Atlas.

**1:40–1:50 · Impact close**
- SAY: "SF Spirits uses Elastic and Mistral to get people off their usual route, into local shops, and caring about the trees, art and history on their own street."
- SHOW: Atlas with Tumble.

---

## 4. 3-minute finalist version

Same beats; add the parts marked **NEW**.

**0:00–0:15 · Who it helps** (same)

**0:15–0:40 · What it is**
- Same SAY.
- **NEW SHOW:** Walk past a shop sign. "Every one of those signs is a real, open shop. We filtered 100,000 business registrations down to 9,000 places you can actually walk into."

**0:40–1:15 · Mistral demo** (same, plus)
- **NEW SAY:** "If Mistral is slow, nothing waits. Cards are cached in Elastic after the first meeting, and the greeting falls back to the cached line after 2.5 seconds."
- Finish the trivia here → befriend.

**1:15–1:50 · Elastic demo** (longer)
- Run **#1** (everything within 150 m, nearest first): "One index, six datasets, one geo query."
- Run **#2** (grounding geo join).
- **NEW:** Run **#3a**: "And aggregations show what every neighborhood holds: trees, shops, films, art."
- Run **#4** (hybrid wish search): "The kNN half is embedded inside Elasticsearch through a Mistral inference endpoint."
- **NEW SHOW:** `GET places/_mapping/field/location,embedding` (geo_point + dense_vector 1024).

**1:50–2:30 · Why people return + social** (longer)
- SAY (built): "Trust carries over between visits. Revisiting a friend unlocks the next chapter of its story. Each spirit's second riddle comes on a return visit, and then the Atlas glows toward the neighborhoods where its wish can be found, which our search tilts toward places like the Excelsior, Bayview and the Outer Sunset."
- SHOW: Atlas → **Wishes** tab (riddle text).
- SAY (built): "New shops appear as rare 'grand opening' spirits straight from the city's business data. Right now there are 38."
- SAY (next): "Next: finding and giving gifts to grant wishes, neighborhood crews with a weekly board, keepsake trading, and real-world gatherings at public places."

**2:30–2:50 · Impact close** (same)

---

## 5. Demo run sheet

**Open beforehand**
1. Terminal: `npm run dev`.
2. Health checks: `npx tsx scripts/smoke-mistral.ts` (4 lines print) and `npx tsx scripts/check-demo-queries.ts` (all ✓).
3. Pre-warm: `npx tsx scripts/prewarm.ts 10` (spirits on the route are cached).
4. **Fresh incognito window**: http://localhost:3000/?dev=1&at=37.7590,-122.4216 (Valencia St). Fresh window = new guest, empty Atlas. `?dev=1` = 20 s retry and click-to-teleport on the map.
5. Kibana Dev Tools tab with `elastic/demo-queries.console` pasted, scrolled to #1.
6. `docs/demo-shots/` open in a Finder/Preview window (fallback screenshots).

**One full encounter**
| Step | Keys / clicks | Fallback |
|---|---|---|
| 1. Show the world | WASD/arrows a few steps; **M** shows the city map, **Esc** closes it | `docs/demo-shots/1-world-valencia.png`, `0-city-map.png` |
| 2. Find Tumble | Walk ~70 m **south** on Valencia to the white ghost with a film-reel halo beside a clapperboard sign. "Meet the film echo" appears. | Lost? **M**, click near Valencia & 20th (dev teleport). Shot: `2-meet-prompt.png` |
| 3. Meet | **E** | Card is cached by pre-warm (instant). Greeting falls back to cached text in 2.5 s. Shot: `3-meet-dialog.png` |
| 4. Play trivia | **Enter**, then pick (number keys 1–4), in this order: release year **1984** → director **Louis Malle** → film shot at La Rondalla: **Crackers** → star **Donald Sutherland** → writer **Jeffrey Fiskin**. 4 of 5 is enough. | Wrong answers? Tumble drifts away; in dev mode it's back in 20 s, trust kept, play again. Shot: `4-trivia.png` |
| 5. Befriend | "♥ Tumble is now your friend!" → **Continue** / **Esc** (a heart floats over Tumble) | Shot: `5-befriended-heart.png` |
| 6. Atlas | **B** → Friends (then Wishes tab) | Shot: `6-atlas.png` |
| 7. Elastic | Dev Tools: run #2, #4 (finalist: #1, #2, #3a, #4, mapping) | If Kibana is slow: show the queries in `elastic/demo-queries.console` and the ✓ output of `check-demo-queries.ts` |

**Backup spirit** (if Tumble misbehaves): **Doughgleam**, La Routine bakery, Tenderloin, rhythm game (tap **Space** on the beat). Open http://localhost:3000/?dev=1&at=37.784457,-122.414143.

**Wi-Fi dies:** the game, Elastic and Mistral all need the internet. Fall back to the screenshots in `docs/demo-shots/` and walk through them.

---

## 6. Judge Q&A

**Who does this actually help?**
People who live here and stick to their routine. Every spirit is anchored at a real tree, shop, artwork or landmark, so playing means noticing your own blocks. 9,163 of the spirits sit at open local shops, and wish search deliberately points to places in neighborhoods like the Excelsior, Bayview and Outer Sunset.

**Why Elastic, not just a database?**
We need geo, text and vector search over one index of 147,000 places. Geo bounding boxes stream the map, geo_distance finds a spirit's real neighbors for Mistral, and hybrid BM25 + kNN with RRF matches a spirit's wish to a place across town. Elastic does all of that in one query language, and the Mistral inference endpoint means it can embed text itself.

**Why Mistral, and which models?**
Mistral Large writes each spirit as structured JSON from the real record. Mistral Small streams the live greeting. Mistral Embed powers the vectors, both in our app and inside Elastic. Mistral Moderation checks every card before it's cached.

**How do you keep the AI accurate about real places?**
Mistral only gets the record's real fields plus nearby places from Elastic, and the prompt forbids inventing facts about real businesses, people, films or art, as well as reviews, prices and hours. Trivia answers come straight from the dataset, not the model. Each card is moderated, validated against a schema, and falls back to a safe template if anything fails. Honest caveat: a spirit's "memories" can be imaginative, but they're presented as its feelings.

**Privacy and safety?**
No API ever returns another player's location, and we don't store positions. Players get an anonymous guest account. Shops are never reviewed or ranked, and there's no crime or 311 talk anywhere in the game.

**What's next?**
Collecting keepsakes and gifting them to grant wishes (the wishes and Elastic matching already exist), weather and day/night spirits, neighborhood crews, trading, gatherings at public places, deploying it online, and the remaining three mini-games.

---

## 7. Pitch claims to cut

- ❌ "Mistral OCR on landmark reports": we use the landmark dataset's fields only.
- ❌ "Vision", "agents", "Vibe CLI", "Agent Builder", "ES|QL": not used.
- ❌ "Events / Our415 / gatherings at real events": not built.
- ❌ "311 data / city haze": not built.
- ❌ "Nature observations": not built.
- ❌ "Weather spirits / day-night": not built.
- ❌ "Companions, crews, trading": not built.
- ❌ "You can gift items / complete quests": only wishes + riddles + matching exist; say "next".
- ❌ "Five mini-games": two (rhythm, film trivia).
- ❌ "Visiting the real shop / GPS check-in": play is virtual; there's no real-world check-in.
- ❌ "It's live / try it on your phone at …": runs locally only.
- ❌ "Aggregations power the game": they're shown in Dev Tools; the Atlas counts come from Supabase.
- ❌ "Every spirit is generated by Mistral": 53 of 54 cached cards are Mistral; others generate on first meeting, with a template fallback.
- ⚠️ Say "the whole city," not "one neighborhood": that's actually more than claimed.
- ⚠️ Say "trivia from the city's film records," not "Mistral writes the trivia."
