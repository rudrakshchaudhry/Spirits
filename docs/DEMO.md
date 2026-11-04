# SF Spirits: Demo Runbook (≈3 min)

## Before you go on stage (T-15 min)
1. `npm run dev`, open **http://localhost:3000/?dev=1&at=37.7590,-122.4216** in a **fresh incognito window**.
   A fresh window means a new guest account, so the Atlas starts empty.
   `?dev=1` shows coordinates, makes the city map (M) click-to-teleport, and shortens "wander off" to 20 s.
2. `npx tsx scripts/smoke-mistral.ts`: all four lines should print (JSON, stream, moderation, embed dims 1024).
3. `npx tsx scripts/prewarm.ts 10`: makes sure the route's spirits are cached (should finish fast, all `mistral-large-latest`).
4. Kibana → Dev Tools, paste `elastic/demo-queries.console`. Leave it open in a second tab.
5. Rehearse once in a *different* incognito window (so the stage window stays fresh).

## The path
| Beat | Do | Say |
|---|---|---|
| 1. World | Start on Valencia St (Mission). Walk a few steps (WASD/arrows). Point at trees, shop signs, spirits. Press **M** for the whole-city map. | "This is real San Francisco: OpenStreetMap streets and buildings, and every tree, shop, film location, artwork and landmark comes from DataSF, indexed in Elasticsearch." |
| 2. Find | Walk ~70 m south down Valencia to the **ghost with a film-reel halo** next to the clapperboard sign at Valencia & 20th (La Rondalla). The "Meet the film echo" prompt appears. | "Spirits spawn from the data. This one lives where *Crackers* (1984) was filmed." |
| 3. Meet | Press **E**. | "Mistral Large wrote this spirit from the real film record and its neighbors, found with an Elastic geo query. The greeting is streaming live from Mistral Small. That riddle is its wish." |
| 4. Play | Press **Enter** → *Take Two* trivia. Answers below. | "The trivia comes straight from the city's film-location records, so it can't hallucinate." |
| 5. Befriend | Trust fills to 100 → "♥ Tumble is now your friend!" + first lore chapter. | "Trust is scored on the server; the friendship is saved in Supabase." |
| 6. Atlas | **Esc**, a heart floats over Tumble. Press **B** → Friends / Met / Wishes. | "The Spirit Atlas: friends, their stories, and the wishes you've heard." |
| 7. Elastic | Switch to Dev Tools: run **#1** (spirits near me), **#2** (the grounding geo join), **#3a** (per-neighborhood aggregation), **#4** (hybrid BM25 + kNN RRF wish search). | "Hybrid search links each wish to a real place elsewhere in the city: BM25 plus mistral-embed vectors, fused with RRF." |

### Tumble's trivia (from DataSF `yitu-d5am`)
- Released: **1984** · Directed by: **Louis Malle** · Starring: **Donald Sutherland** (also Jack Warden, Sean Penn)
- Written by: **Jeffrey Fiskin** · Filmed at: **La Rondalla (Valencia and 20th Streets)**
- Tumble is *bold* (starts at 55 trust): 4 of 5 correct befriends it in one visit.

## Backup spirits (all pre-warmed, all befriendable in one visit)
| Spirit | Where | Game | Link |
|---|---|---|---|
| **Doughgleam** (La Routine bakery) | Tenderloin | Rustle (rhythm): tap Space on the beat, ≥ 75% | `/?dev=1&at=37.784457,-122.414143` |
| **Reelglow** (*The Dead Pool*, 1988) / **Pod** (*Invasion of the Body Snatchers*, 1978) | Tenderloin | Take Two | same link, walk a few steps |
| **Scriptwind** (*Murder in the First*) | Civic Center | Take Two | `/?dev=1&at=37.7793,-122.4176` |
| **Tassel** (Noel Mae Designs) | near Dolores Park | Rustle | `/?dev=1&at=37.7596,-122.4269` then walk east |

## If something goes wrong
- **Mistral slow or down:** cards are cached in ES (pre-warm), and the greeting falls back to the cached line after 2.5 s. Nothing blocks.
- **Spirit "drifts away"** (score too low): in `?dev=1` it's back in 20 s, and trust is kept, so play again.
- **Already friends** (re-used window): meeting shows "friend · lore 2/3", which is also a nice beat. Or open a new incognito window.
- **Lost:** press **M** and click the map (dev mode teleports).
