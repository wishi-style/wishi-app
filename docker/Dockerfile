FROM node:22-alpine AS base

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# --- Builder ---
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . ./
ARG NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=$NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
ENV NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
RUN npx prisma generate
RUN npm run build

# --- Runner ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/package.json ./package.json
# Generated Prisma client — needed so prisma/seed.ts can import the
# typed client (it resolves `../src/generated/prisma/client`). Without
# this, `npx tsx prisma/seed.ts` fails at module resolution.
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated
# Shared demo fixture identifiers — imported by prisma/seeds/demo-users.ts
# as raw TS when the deploy workflow runs the seed outside the Next.js
# standalone bundle. Same reasoning as src/generated above: seed-time code
# needs source files that Next's build tracing doesn't pull in.
COPY --from=builder --chown=nextjs:nodejs /app/src/lib/demo ./src/lib/demo
# Copy full node_modules so the deployed image can run `npx prisma migrate
# deploy` against the production DB during the deploy workflow. Next.js
# standalone bundles only what the app code traces — it intentionally does
# NOT include the prisma CLI or its transitive deps (e.g. `effect`), which
# is why a narrow `node_modules/prisma + @prisma` copy fails at runtime
# with `Cannot find module 'effect'`. Bloating the image by ~300MB is the
# right trade-off for reliable in-deploy migrations.
COPY --from=builder /app/node_modules ./node_modules

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
