# Long Tail on Temporal: API and worker from one image, selected by APP_ROLE.
ARG NODE_IMAGE=node:22-bookworm-slim

# Root certificates for the TLS connection to Temporal Cloud.
FROM ${NODE_IMAGE} AS base
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

FROM base AS dev
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
CMD ["npx", "tsx", "watch", "src/index.ts"]

FROM dev AS builder
RUN npm run build

FROM base AS production
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev
COPY --from=builder /app/build ./build
EXPOSE 3000
CMD ["node", "build/index.js"]
