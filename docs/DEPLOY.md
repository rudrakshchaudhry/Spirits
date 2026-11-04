# Deploying SF Spirits (Vercel)

The repo is deploy-ready. These steps need your Vercel account, so they weren't run automatically.

## 1. Import the project
1. Go to vercel.com → **Add New… → Project** → import `rudrakshchaudhry/Spirits`.
2. Framework preset: **Next.js** (auto-detected). Build command and output stay at their defaults.

## 2. Environment variables (Project → Settings → Environment Variables)
| Name | Value | Notes |
|---|---|---|
| `ELASTICSEARCH_URL` | your Elastic Cloud endpoint | or `ELASTIC_CLOUD_ID` |
| `ELASTICSEARCH_API_KEY` | API key | needs read/write on `places`, `spirits`, `neighborhoods`, `events` |
| `MISTRAL_API_KEY` | Mistral key | |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://wyaubwtauvlvvsprkqbw.supabase.co` | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | publishable key | |
| `SUPABASE_SERVICE_ROLE_KEY` | **a newly rotated secret key** | the old one was pasted in chat; rotate it first |
| `ENCOUNTER_SECRET` | `openssl rand -hex 32` | signs encounter tokens |
| `CRON_SECRET` | `openssl rand -hex 24` | Vercel sends it to the cron routes |
| `SOCRATA_APP_TOKEN` | optional | only used by ingest crons |
| `ALLOW_DEV_CONDITIONS` | **leave unset in production** | set `1` only for a stage-demo deployment (dev panel, demo check-in, demo mode, dev grants) |

## 3. Crons
`vercel.json` schedules:
- `/api/cron/refresh-311`: hourly. The **Hobby plan only allows daily crons**, so on Hobby change it to `"0 14 * * *"`.
- `/api/cron/new-business`: daily, re-ingests businesses (new openings, closed shops).
- `/api/cron/featured`: daily at 06:05 PT, pre-generates the featured spirit.

The new-business cron runs up to ~20 s. Its `maxDuration` is 300, which needs Pro; on Hobby the limit is 60 s, which is still enough.

## 4. Supabase settings
- Auth → Providers: keep **Email**. Guests are created server-side by `/api/guest`, so Anonymous sign-ins can stay off.
- Auth → Settings: turn on **Leaked password protection** (the security advisor flags it).
- Realtime is used for gathering lobbies (presence only, no tables). It's on by default.

## 5. Data (one-time, from your machine)
```bash
npm run es:setup
npm run ingest                         # ~2 min, all DataSF datasets + 311 haze
npx tsx scripts/embed-places.ts        # mistral-embed vectors (hybrid wish search)
npx tsx scripts/seed-gatherings.ts 3   # 14 days of gatherings at public parks (re-run weekly)
npx tsx scripts/curate-quest.ts        # the Tenderloin → Ocean Beach sea-shell quest
npx tsx scripts/prewarm.ts 10          # pre-generate spirits along the demo route
```
The Elasticsearch inference endpoint `mistral-embed` (used by the Dev Tools hybrid query) was created once with `PUT _inference/text_embedding/mistral-embed`; see `elastic/demo-queries.console`.

## 6. After the first deploy
- Open `/`: you should get onboarding, then the world.
- `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/featured` should return the featured spirit.
- Run `E2E_BASE=https://<app> npx tsx scripts/e2e-quest.ts <placeId>` against production (it creates a guest).
