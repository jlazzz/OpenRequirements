# Build context is the repo root.
FROM node:26-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY packages/importers/package.json packages/importers/
COPY packages/reqif/package.json packages/reqif/
RUN npm ci
COPY . .
RUN npm run build && DOCS_BASE=/help/ npm run docs:build && npm prune --omit=dev

FROM node:26-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/server apps/server
COPY --from=build /app/apps/web/dist apps/web/dist
COPY --from=build /app/packages packages
# The user guide, served at /help.
COPY --from=build /app/docs/.vitepress/dist docs/.vitepress/dist
# The attachments volume inherits this ownership, so the unprivileged user can write uploads.
RUN mkdir -p /data/attachments && chown node:node /data/attachments
USER node
EXPOSE 3000
# Node runs the TypeScript sources directly, so the server has no build step.
CMD ["node", "apps/server/src/main.ts"]
