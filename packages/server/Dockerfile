# packages/server/Dockerfile — build context is the repo root (see fly.toml).
#
# dist/serve.js is an esbuild bundle of the whole server except `pg`, so the
# runtime stage needs only the compiled file + production node_modules for pg.

FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
WORKDIR /app

# lockfile layer: package manifests first so dep installs cache cleanly
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY packages/rating/package.json packages/rating/package.json
COPY packages/server/package.json packages/server/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/uploader/package.json apps/uploader/package.json
COPY apps/addon/package.json apps/addon/package.json
RUN pnpm install --frozen-lockfile

COPY . .
# @acl/server... = the server plus its workspace deps (contracts, rating)
RUN pnpm --filter @acl/server... build

# production-only install of just the server package's deps (pg)
RUN pnpm --filter @acl/server deploy --prod /out

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production ACL_PORT=8080
COPY --from=build /out/node_modules ./node_modules
COPY --from=build /out/package.json ./package.json
COPY --from=build /out/dist ./dist
USER node
EXPOSE 8080
CMD ["node", "dist/serve.js"]
