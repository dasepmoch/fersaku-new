# Multi-stage Dockerfile with targets: builder, api, worker.
# Documented choice: single Dockerfile, multi-target (not Dockerfile.worker).
# Build:
#   docker build --target api -t fersaku-api .
#   docker build --target worker -t fersaku-worker .
# No secrets are baked into images.

FROM golang:1.25-alpine AS builder

RUN apk add --no-cache ca-certificates git

WORKDIR /src

COPY go.mod go.sum* ./
RUN go mod download

COPY . .

ARG TARGETOS=linux
ARG TARGETARCH=amd64
ARG VERSION=dev

RUN CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" \
    -o /out/fersaku-api ./cmd/api \
 && CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${TARGETARCH} \
    go build -trimpath -ldflags="-s -w -X main.version=${VERSION}" \
    -o /out/fersaku-worker ./cmd/worker

# Shared minimal non-root runtime (alpine for wget healthcheck).
FROM alpine:3.21 AS runtime-base

RUN apk add --no-cache ca-certificates wget \
 && addgroup -g 65532 -S nonroot \
 && adduser -u 65532 -S nonroot -G nonroot \
 && mkdir -p /app \
 && chown -R nonroot:nonroot /app

WORKDIR /app
USER nonroot:nonroot

# --- api target ---
FROM runtime-base AS api

COPY --from=builder --chown=nonroot:nonroot /out/fersaku-api /app/fersaku-api

EXPOSE 8080
ENTRYPOINT ["/app/fersaku-api"]

# --- worker target (no public listener) ---
FROM runtime-base AS worker

COPY --from=builder --chown=nonroot:nonroot /out/fersaku-worker /app/fersaku-worker

ENTRYPOINT ["/app/fersaku-worker"]
