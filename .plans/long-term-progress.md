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

## F: Living world (branch `checkpoint-f`) ✅
- [x] /api/conditions: Open-Meteo fog/rain + suncalc phase + blossom season, cached 15 min; haze map; featured hint
- [x] Atmosphere: day/night tint, lantern + shop-window glow, drifting fog (thicker west), rain particles, haze veil per neighbourhood
- [x] Condition spirits (night/fog/rain/blossom, +1 rarity, own Mistral cards, variant auras)
- [x] Condition keepsakes (scrap of fog, rain drop, moon dust, petal)
- [x] 311 haze: `npm run ingest -- haze` (aggregates only) → neighborhoods.haze_score/prev; Atlas "haze is lifting"
- [x] New-business sparkle; daily featured rare (06:00 PT) with banner, encounter chip, Atlas compass hint
- [x] Dev panel (?dev=1, server needs ALLOW_DEV_CONDITIONS=1): force conditions, teleport, ★ featured, grant keepsakes
- [x] Cron routes + vercel.json (CRON_SECRET): refresh-311 hourly (needs Vercel Pro; hobby = daily), new-business daily, featured daily

## G: Together (branch `checkpoint-g`) ✅
- [x] Onboarding: moderated handle, home neighbourhood (crew, change every 30 days), companion; spawn in a home park
- [x] Companion follows, "!" near spirits, templated lines, 3 forms, trait absorption from top neighbourhoods
- [x] Milestone unlocks + one "next goal" HUD line; demo mode unlocks all (server-gated)
- [x] Crew board: `crew_scores()` SQL function (weekly, normalised by active members), cached 10 min
- [x] Trading: keepsakes only, limits (10/day, ≤5 per item), atomic `execute_trade` with row locks; counter/decline/cancel
- [x] Profiles: public after trading unlock; companion, favourites, stats; never location
- [x] Gatherings: ES events at public parks (seed script, `--now` for testing), GPS check-in validated server-side (boolean only stored), Supabase Realtime presence lobby (handles only), co-op rhythm → befriends everyone present; DEMO CHECK-IN
- [x] `scripts/e2e-social.ts`
- Deferred: "new wish on revisit (30%)" bonus

## H: Polish and deploy (branch `checkpoint-h`)
- [x] Unit tests (vitest, 21): projection, spawning, glints, conditions, tokens, games, catalog, social rules, trades, check-in distance
- [x] Sound pass (synth chimes for pickup / befriend / wish) + mute toggle
- [x] Mobile pass (featured banner below the HUD on phones; panels fit 390 px)
- [x] Deploy-ready: `docs/DEPLOY.md` (env vars, cron plan limits, Supabase settings, one-time data scripts)
- [ ] **Needs the user:** Vercel import + env vars (no Vercel CLI/login on this machine); rotate the Supabase secret key

## Roadmap items deliberately out of scope (need product/legal decisions)
- Native app (Capacitor), push notifications, business partnerships, real-world check-in bonuses at shops

## Self-improvement log
- improve/explore-cap: /api/explore accepted 50 arbitrary chunk keys per call (incl. ocean), so one request could unlock the crew board, evolve the companion and farm crew scores. Now land-only, 10/request, 40 new chunks per 5 min; client re-queues deferred keys. +1 test.
