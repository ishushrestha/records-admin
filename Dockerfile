# Build under ~1.5 GB RAM: cap Node heaps and keep the runtime image to the
# production API plus the Vite dist. Compose in intake-form builds this from
# a sibling clone at ../records-admin.
FROM node:22-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
ENV NODE_OPTIONS=--max-old-space-size=768
ENV PNPM_NETWORK_CONCURRENCY=1
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/tsconfig.json apps/api/tsconfig.build.json ./apps/api/
COPY apps/web/package.json apps/web/tsconfig.json ./apps/web/
COPY packages/contracts/package.json packages/contracts/tsconfig.json packages/contracts/tsconfig.build.json ./packages/contracts/
RUN pnpm install --frozen-lockfile
COPY apps/api/src ./apps/api/src
COPY apps/web ./apps/web
COPY packages/contracts/src ./packages/contracts/src
RUN pnpm build && pnpm --filter @records/api deploy --prod --legacy /out

FROM node:22-bookworm-slim AS runtime
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN corepack enable && corepack prepare pnpm@10.33.4 --activate
WORKDIR /app
COPY --from=build /out/ ./
COPY --from=build /src/apps/web/dist ./web/dist
ENV NODE_ENV=production
ENV PORT=3002
ENV DATABASE_URL=file:/data/records.db
ENV UPLOAD_DIR=/data/uploads
ENV WEB_ROOT=/app/web/dist
RUN mkdir -p /data/uploads
EXPOSE 3002
CMD ["pnpm", "start"]
