# Long-term build: progress tracker

Source of truth for what's left. Spec: `.plans/sf-spirits-spec.md` (§17 checkpoints, §20 roadmap).
Git flow: one branch per checkpoint, stacked (`hackathon-build` → `checkpoint-d` → `checkpoint-e` …), each pushed with a PR into `main`. PRs are not merged without the user's OK.

## Done
- [x] A: walk the city (PR #1)
- [x] B: the city is alive (PR #1)
- [x] C: meet a spirit (PR #1)

## D: Gifts and quests (branch `checkpoint-d`) ✅
- [x] Bake: per-chunk meta → `lib/world/chunk-meta.json`
- [x] Glints: deterministic per (chunk, 2-hour window), typed by places; sea shells on Pacific sand; hood exclusives
- [x] Supabase: inventory (cap 20), pickups_claimed, explored_chunks, grant/consume functions, wish_fulfilled_at
- [x] API: /api/pickup, /api/inventory, /api/explore, /api/encounter/gift; /api/atlas extended
- [x] Client: glints, walk-over pickup, "♪ X would love this" toast, explored-chunk reporting, window refresh
- [x] Gift UI (after play + friend revisit): wish +40 → rare + secret chapter (Mistral, cached); theme +10; decline keeps it
- [x] Atlas: Keepsakes tab, Map tab (fog by explored %, wish glow)
- [x] Demo quest: `scripts/curate-quest.ts` (Tenderloin ancient tree wishes for a sea shell); wish linking handles hood-exclusive keepsakes
- [x] `scripts/e2e-quest.ts` API end-to-end check
- Not done: revisit "new wish" (30%) — deferred to G (needs companion XP)

## E: Every family (branch `checkpoint-e`) ✅
- [x] Shopkeeper "Rush Hour": generic per-category menus (no claims about the real shop's menu)
- [x] Ancient "Then or Now": clues from landmark/art/shop/park fields; options = real places within 300 m (ES geo_distance)
- [x] Art guardian "Mosaic": rotating-tile puzzle from the seed palette; reveals real title/artist/year
- [x] Park spirits: "Birdsong" rhythm variant
- [x] Reduced motion (rhythm ring mode), colour-blind safe (✓/✗ + text feedback, shape-based mosaic)
- [x] Dev test hook `window.__game` (only with ?dev=1)

## F: Living world (branch `checkpoint-f`)
- [ ] /api/conditions: Open-Meteo (fog/rain) + suncalc (night) + blossom season, cached 15 min
- [ ] Day/night tint + lamp glow, fog overlay, rain particles
- [ ] Condition spirits (night/fog/rain/blossom variants, +1 rarity)
- [ ] Condition-gated keepsakes (fog scrap, rain drop, moon dust, petal)
- [ ] 311 haze: ingest-311 aggregation → neighborhoods.haze_score; haze overlay
- [ ] New-business sparkle marker; daily featured rare (+ banner + Atlas hint)
- [ ] Dev conditions panel (?dev=1)
- [ ] Cron routes (vercel.json)

## G: Together (branch `checkpoint-g`)
- [ ] Onboarding: handle, home neighborhood (crew), companion pick (Mote/Sprig/Tidepip)
- [ ] Companion follows, reacts to nearby spirits, evolves (3 forms), trait absorption
- [ ] Milestone unlocks + "next goal" HUD; demo-mode unlock-all
- [ ] Crew board (weekly score, materialized view)
- [ ] Trading (execute_trade SQL function, limits)
- [ ] Profiles
- [ ] Gatherings: events, GPS check-in (no raw coords stored), Realtime lobby, co-op rhythm

## H: Polish and deploy (branch `checkpoint-h`)
- [ ] Loading states, sound pass, mobile pass, accessibility pass
- [ ] Vercel deploy (env vars, cron)
- [ ] Tests for core server logic

## Roadmap items deliberately out of scope (need product/legal decisions)
- Native app (Capacitor), push notifications, business partnerships, real-world check-in bonuses at shops
