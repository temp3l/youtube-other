# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:22-bookworm-slim@sha256:9f6d5975c7dca860947d3915877f85607946403fc55349f39b4bc3688448bb6e

FROM ${NODE_IMAGE} AS build

ARG MATH_RENDER_WORKER_BUILD_REVISION
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:${PATH}
ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /workspace

RUN case "${MATH_RENDER_WORKER_BUILD_REVISION}" in \
      (*[!a-f0-9]*|"") exit 64 ;; \
      (*) test "${#MATH_RENDER_WORKER_BUILD_REVISION}" -ge 40 \
          && test "${#MATH_RENDER_WORKER_BUILD_REVISION}" -le 64 ;; \
    esac
RUN corepack enable \
    && corepack prepare pnpm@10.16.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/domain ./packages/domain
COPY packages/math-education ./packages/math-education
COPY packages/math-rendering ./packages/math-rendering
COPY packages/observability ./packages/observability
COPY packages/process-runner ./packages/process-runner
COPY packages/rendering ./packages/rendering
COPY packages/shared ./packages/shared
COPY packages/speech ./packages/speech
COPY packages/story-localization ./packages/story-localization
COPY packages/visual-planning ./packages/visual-planning
COPY packages/workflow-engine ./packages/workflow-engine

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @mediaforge/math-rendering... build
RUN node_modules/.pnpm/esbuild@0.27.7/node_modules/esbuild/bin/esbuild \
      packages/math-rendering/dist/worker/math-render-worker-entrypoint.js \
      --bundle \
      --platform=node \
      --format=esm \
      --target=node22 \
      --tree-shaking=true \
      --minify-syntax \
      --external:sharp \
      --outfile=/opt/math-render-worker/worker.mjs \
    && mkdir -p /opt/math-render-worker/node_modules/@img \
    && cp -aL node_modules/sharp /opt/math-render-worker/node_modules/sharp \
    && cp -aL node_modules/.pnpm/@img+colour@1.1.0/node_modules/@img/colour \
      /opt/math-render-worker/node_modules/@img/colour \
    && cp -aL node_modules/.pnpm/@img+sharp-linux-x64@0.34.5/node_modules/@img/sharp-linux-x64 \
      /opt/math-render-worker/node_modules/@img/sharp-linux-x64 \
    && cp -aL node_modules/.pnpm/@img+sharp-libvips-linux-x64@1.2.4/node_modules/@img/sharp-libvips-linux-x64 \
      /opt/math-render-worker/node_modules/@img/sharp-libvips-linux-x64 \
    && cp -aL node_modules/.pnpm/detect-libc@2.1.2/node_modules/detect-libc \
      /opt/math-render-worker/node_modules/detect-libc \
    && cp -aL node_modules/.pnpm/semver@7.8.4/node_modules/semver \
      /opt/math-render-worker/node_modules/semver \
    && rm -rf \
      /opt/math-render-worker/node_modules/sharp/install \
      /opt/math-render-worker/node_modules/sharp/src

FROM ${NODE_IMAGE} AS worker

ARG MATH_RENDER_WORKER_BUILD_REVISION
ARG FFMPEG_VERSION=7:5.1.9-0+deb12u1

RUN apt-get update \
    && apt-get install --yes --no-install-recommends "ffmpeg=${FFMPEG_VERSION}" \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build --chown=65534:65534 /opt/math-render-worker /opt/math-render-worker

LABEL org.opencontainers.image.title="Mediaforge math scene worker" \
      org.opencontainers.image.revision="${MATH_RENDER_WORKER_BUILD_REVISION}" \
      org.opencontainers.image.description="Offline CPU-only silent math scene fragment worker"

ENV HOME=/nonexistent \
    TMPDIR=/cache/tmp \
    XDG_CACHE_HOME=/cache/runtime \
    MATH_RENDER_WORKER_BUILD_REVISION=${MATH_RENDER_WORKER_BUILD_REVISION}

WORKDIR /opt/math-render-worker
USER 65534:65534

ENTRYPOINT ["node", "worker.mjs"]
