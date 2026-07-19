# Multi-stage production frontend image (Next.js standalone).
# Build from monorepo root or frontend/:
#   docker build -f frontend/Dockerfile -t fersaku-frontend:local frontend
# Runtime env (not baked): API_INTERNAL_URL, NEXT_PUBLIC_*, RELEASE_ID
# Build-time public env only via ARG → ENV before `next build`.
# No secrets in image layers.

FROM node:24-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-alpine AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_APP_STAGE=live
ARG NEXT_PUBLIC_DATA_SOURCE=api
ARG NEXT_PUBLIC_RELEASE_ID=dev
ARG VERSION=dev
# Next rewrites are evaluated at build time; bake compose/k8s service DNS default.
# Public SSG degrades if API unreachable at build (empty featured / fee launch fallback).
ARG API_INTERNAL_URL=http://api:8080
ENV NEXT_PUBLIC_APP_STAGE=$NEXT_PUBLIC_APP_STAGE \
    NEXT_PUBLIC_DATA_SOURCE=$NEXT_PUBLIC_DATA_SOURCE \
    NEXT_PUBLIC_RELEASE_ID=$NEXT_PUBLIC_RELEASE_ID \
    API_INTERNAL_URL=$API_INTERNAL_URL \
    NEXT_TELEMETRY_DISABLED=1 \
    NEXT_TEST_WASM=1

RUN npm run build

FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN apk add --no-cache wget \
 && addgroup -g 65532 -S nonroot \
 && adduser -u 65532 -S nonroot -G nonroot

# Standalone output + static assets (Next standalone layout)
COPY --from=builder --chown=nonroot:nonroot /app/public ./public
COPY --from=builder --chown=nonroot:nonroot /app/.next/standalone ./
COPY --from=builder --chown=nonroot:nonroot /app/.next/static ./.next/static

USER nonroot:nonroot
EXPOSE 3000

# Runtime-only: API_INTERNAL_URL (SSR + /v1 rewrites). Do not bake secrets.
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
