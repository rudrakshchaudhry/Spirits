# syntax=docker/dockerfile:1
# SF Spirits: production image (Next.js standalone server) plus a "tools" target
# for the data scripts (es:setup, ingest, embed, seed). See docs/DEPLOY.md.

ARG NODE_VERSION=22

FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Full source + dev dependencies: runs the tsx data scripts and tests.
FROM deps AS tools
COPY . .
CMD ["npm", "run"]

FROM deps AS build
COPY . .
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time.
# They are public (Supabase URL + publishable key), never server secrets.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:${NODE_VERSION}-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://127.0.0.1:3000/api/conditions').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
