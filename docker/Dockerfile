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
# Required so `npx tsx prisma/seed.ts` can resolve `@/...` path aliases
# at deploy-time seed execution. Without it, every transitive `@/lib/...`
# import from the seed graph fails with MODULE_NOT_FOUND.
COPY --from=builder /app/tsconfig.json ./tsconfig.json
# Generated Prisma client — needed so prisma/seed.ts can import the
# typed client (it resolves `../src/generated/prisma/client`). Without
# this, `npx tsx prisma/seed.ts` fails at module resolution.
COPY --from=builder --chown=nextjs:nodejs /app/src/generated ./src/generated
# Source files that prisma/seeds/*.ts requires at deploy-time seed
# execution. The seed runs `npx tsx prisma/seed.ts` as a one-off ECS task,
# which resolves relative imports like `../../src/lib/demo/constants` and
# `../../src/lib/stylists/review.service` against the runner filesystem
# — and Next's standalone tracing doesn't pull them in (it only traces
# from app entry points). Copy all of src/lib so any future seed-time
# import works without another Dockerfile change. The image-size cost is
# trivial relative to the ~300MB node_modules already copied below.
COPY --from=builder --chown=nextjs:nodejs /app/src/lib ./src/lib
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
