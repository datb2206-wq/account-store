# syntax=docker/dockerfile:1.7
# =============================================================
#  Image production cho monorepo. Build từ thư mục gốc:
#    docker build -f docker/Dockerfile --target web    -t accszone-web .
#    docker build -f docker/Dockerfile --target worker -t accszone-worker .
#  (docker-compose.prod.yml đã làm sẵn việc này)
# =============================================================

ARG NODE_VERSION=20

# ---------- base: Node + pnpm (đúng phiên bản trong package.json) ----------
# Debian slim thay vì Alpine: Prisma engine và glibc ổn định hơn, không cần binaryTargets riêng.
FROM node:${NODE_VERSION}-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ---------- deps: chỉ copy manifest -> layer cài đặt được cache khi chỉ sửa code ----------
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/database/package.json packages/database/
COPY packages/tsconfig/package.json packages/tsconfig/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

# ---------- builder: prisma generate + build database + next build ----------
FROM deps AS builder
COPY . .
RUN pnpm --filter @accszone/database build
RUN --mount=type=cache,target=/app/apps/web/.next/cache \
    NEXT_OUTPUT=standalone pnpm --filter @accszone/web build
# Next không trace được file engine của Prisma (.so.node) trong monorepo pnpm -> copy thủ công
RUN for d in node_modules/.pnpm/@prisma+client@*/node_modules/.prisma/client; do \
      mkdir -p "apps/web/.next/standalone/$d" && cp -r "$d/." "apps/web/.next/standalone/$d/"; \
    done

# ---------- web: chỉ chứa output standalone (~200MB thay vì >1GB) ----------
FROM node:${NODE_VERSION}-bookworm-slim AS web
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 UPLOAD_DIR=/app/uploads
# Thư mục biên lai (mount volume vào đây); tạo sẵn với quyền user node để volume mới mang đúng owner
RUN mkdir -p /app/uploads && chown node:node /app/uploads
COPY --from=builder --chown=node:node /app/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/web/.next/static ./apps/web/.next/static
# Standalone không tự copy public/ (logo.svg...) -> thiếu dòng này production sẽ 404 logo
COPY --from=builder --chown=node:node /app/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]

# ---------- worker: chạy BullMQ worker bằng tsx; kiêm luôn việc chạy migration ----------
# Cần cả devDependencies của packages/database (Prisma CLI) để `prisma migrate deploy`.
FROM base AS worker
ENV NODE_ENV=production
COPY --from=builder --chown=node:node /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/packages ./packages
COPY --from=builder --chown=node:node /app/apps/worker ./apps/worker
USER node
WORKDIR /app/apps/worker
# Gọi thẳng node (không qua pnpm/dotenv): nhận SIGTERM trực tiếp để đóng job đang chạy an toàn
CMD ["node", "--import", "tsx", "src/index.ts"]
