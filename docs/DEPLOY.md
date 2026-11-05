# Deploying SF Spirits

Two options: **A. Vercel** (sections 1–6, recommended) or **B. Docker / self-hosting** (section 7). Both use the
same hosted Elasticsearch, Supabase and Mistral, and the same environment variables.

**Option A: Vercel**

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
- **New Supabase project:** apply every file in `supabase/migrations/` in filename order, either in the SQL editor or with the Supabase CLI (`supabase link --project-ref <ref>` then `supabase db push`). The existing project `wyaubwtauvlvvsprkqbw` already has all of them, up to `20261104000013`.
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

## 7. Option B: Docker / self-hosting
The `Dockerfile` builds a minimal Next.js standalone server (`runner` target) and a `tools` target with the full
source for the data scripts. `docker-compose.yml` runs the app plus a small cron sidecar that calls the same cron
routes on the same schedules as `vercel.json`.

```bash
cp .env.example .env.local          # fill in the keys
npm run docker:up                   # docker compose --env-file .env.local up -d --build → http://localhost:3000
PORT=8080 npm run docker:up         # another host port
npm run docker:tools -- npm run es:setup     # data scripts run in the tools image
npm run docker:tools -- npx tsx scripts/embed-places.ts
npm run docker:down
```
Notes:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` are baked into the browser bundle at **build** time
  (they're public values). Rebuild the image after changing them. All other variables are read at runtime from
  `.env.local`, and no secret is ever copied into the image (`.dockerignore` excludes `.env*`).
- The container reports healthy once `/api/conditions` responds. The cron sidecar starts after that.
- `next build` uses `output: "standalone"` only when `NEXT_OUTPUT=standalone` (the Dockerfile sets it), so Vercel and
  `npm start` are unaffected.
- Put a reverse proxy (TLS, request limits) in front for a public deployment. Rate limits key on `x-real-ip` /
  `x-forwarded-for`, so the proxy must set those headers.
- The `use cache` data cache lives in memory per container. For several replicas, see Next's self-hosting guide
  (`node_modules/next/dist/docs/01-app/02-guides/self-hosting.md`).

## CI
`.github/workflows/ci.yml` runs on every PR and every push to `main`: lint, typecheck, unit tests, `next build`, then a
Docker image build. None of these steps needs secrets.
