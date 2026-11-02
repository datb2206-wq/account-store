#!/usr/bin/env bash
# =============================================================
#  Khôi phục DB từ file .dump do backup-db.sh tạo.
#    deploy/scripts/restore-db.sh /var/backups/accszone/accszone_20261028_030000.dump
#
#  GHI ĐÈ toàn bộ dữ liệu hiện tại. Script tự dừng web + worker trong lúc khôi phục
#  (mode docker) để không có đơn hàng/giao dịch mới ghi vào giữa chừng.
#  Cần đúng ENCRYPTION_KEY lúc tạo backup thì dữ liệu kho mới giải mã được.
# =============================================================
set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"
FILE="${1:-}"

log() { echo "$(date '+%F %T') [restore] $*"; }
die() { log "LỖI: $*"; exit 1; }
env_get() {
  [[ -f "$ENV_FILE" ]] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}
cfg() { local v="${!1:-}"; [[ -n "$v" ]] || v="$(env_get "$1")"; echo "${v:-$2}"; }

[[ -f "$FILE" ]] || die "cách dùng: $0 <file.dump>"
if [[ -f "$FILE.sha256" ]]; then
  (cd "$(dirname "$FILE")" && sha256sum -c --quiet "$(basename "$FILE").sha256") || die "checksum không khớp"
fi

MODE="$(cfg BACKUP_MODE docker)"
COMPOSE_FILE="$(cfg BACKUP_COMPOSE_FILE docker/docker-compose.prod.yml)"
PG_USER="$(cfg POSTGRES_USER accszone)"
PG_DB="$(cfg POSTGRES_DB accszone)"
compose() { docker compose -f "$PROJECT_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

echo "Sẽ GHI ĐÈ database \"$PG_DB\" bằng: $FILE"
read -r -p "Gõ RESTORE để tiếp tục: " ans
[[ "$ans" == "RESTORE" ]] || die "đã hủy"

case "$MODE" in
  docker)
    # Chỉ dừng web/worker khi file compose có các service đó (bản dev chỉ có postgres/redis)
    APP_SERVICES=$(compose config --services | grep -xE 'web|worker' || true)
    if [[ -n "$APP_SERVICES" ]]; then
      log "dừng: $APP_SERVICES"; compose stop $APP_SERVICES
    else
      log "nhớ dừng web/worker (pm2 stop all) trước khi khôi phục"
    fi
    # --single-transaction: lỗi giữa chừng thì DB giữ nguyên như trước
    status=0
    compose exec -T postgres pg_restore -U "$PG_USER" -d "$PG_DB" --clean --if-exists --no-owner --single-transaction < "$FILE" || status=$?
    if [[ -n "$APP_SERVICES" ]]; then log "chạy lại: $APP_SERVICES"; compose start $APP_SERVICES; fi
    (( status == 0 )) || die "pg_restore lỗi (mã $status) — dữ liệu chưa bị thay đổi"
    ;;
  native)
    URL="$(cfg DATABASE_URL '')"; URL="${URL%%\?*}"
    pg_restore -d "$URL" --clean --if-exists --no-owner --single-transaction "$FILE"
    ;;
  *) die "BACKUP_MODE không hợp lệ: $MODE" ;;
esac
log "khôi phục xong"
