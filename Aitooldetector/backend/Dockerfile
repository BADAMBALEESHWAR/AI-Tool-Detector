# syntax=docker/dockerfile:1

# ── Build: install all deps, generate the Prisma client, compile TypeScript ──
FROM node:20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ── Runtime ─────────────────────────────────────────────────────────────────
# node_modules is copied whole (not pruned) so the Prisma CLI is available for
# `prisma migrate deploy` at start-up and ts-node for the optional seed.
FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=3001
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY tsconfig.json tsconfig.build.json ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p uploads downloads logs \
 && chown -R node:node uploads downloads logs
USER node
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
