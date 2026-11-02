#!/usr/bin/env bash
# =============================================================
#  Backup PostgreSQL định kỳ (pg_dump custom format, đã nén).
#
#  Chạy tay:   deploy/scripts/backup-db.sh
#  Cron 3h sáng mỗi ngày (crontab -e):
#    0 3 * * * /opt/accszone/deploy/scripts/backup-db.sh >> /var/log/accszone-backup.log 2>&1
#
#  Biến tùy chọn (đặt trong .env hoặc trước lệnh):
#    BACKUP_DIR          thư mục lưu          (mặc định /var/backups/accszone)
#    BACKUP_RETENTION_DAYS  giữ bao nhiêu ngày (mặc định 14)
#    BACKUP_MODE         docker | native      (mặc định docker)
#    BACKUP_COMPOSE_FILE file compose chứa service "postgres"
#                        (mặc định docker/docker-compose.prod.yml; dùng PM2 thì
#                         đặt docker/docker-compose.yml)
#    BACKUP_RCLONE_REMOTE VD "b2:my-bucket/accszone" -> đẩy bản sao ra ngoài máy chủ
#    BACKUP_PING_URL     URL gọi khi thành công (healthchecks.io...) để báo nếu backup ngừng chạy
#
#  LƯU Ý: dữ liệu kho được mã hóa bằng ENCRYPTION_KEY. Backup DB mà mất khóa = mất kho.
#  Cất .env (hoặc ít nhất ENCRYPTION_KEY) ở nơi an toàn KHÁC với nơi lưu backup.
# =============================================================
set -Eeuo pipefail
umask 077

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ENV_FILE="${ENV_FILE:-$PROJECT_DIR/.env}"

log() { echo "$(date '+%F %T') [backup] $*"; }
die() { log "LỖI: $*"; exit 1; }

# Đọc 1 biến từ .env mà không `source` cả file (giá trị có thể chứa ký tự đặc biệt)
env_get() {
  [[ -f "$ENV_FILE" ]] || return 0
  grep -E "^$1=" "$ENV_FILE" | tail -n1 | cut -d= -f2- | sed -E 's/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/'
}
cfg() { local v="${!1:-}"; [[ -n "$v" ]] || v="$(env_get "$1")"; echo "${v:-$2}"; }

BACKUP_DIR="$(cfg BACKUP_DIR /var/backups/accszone)"
RETENTION_DAYS="$(cfg BACKUP_RETENTION_DAYS 14)"
MODE="$(cfg BACKUP_MODE docker)"
COMPOSE_FILE="$(cfg BACKUP_COMPOSE_FILE docker/docker-compose.prod.yml)"
RCLONE_REMOTE="$(cfg BACKUP_RCLONE_REMOTE '')"
PING_URL="$(cfg BACKUP_PING_URL '')"
PG_USER="$(cfg POSTGRES_USER accszone)"
PG_DB="$(cfg POSTGRES_DB accszone)"

[[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || die "BACKUP_RETENTION_DAYS phải là số"
mkdir -p "$BACKUP_DIR"

# Không cho 2 lần backup chạy chồng nhau (cron + chạy tay)
if command -v flock > /dev/null; then
  exec 9>"$BACKUP_DIR/.lock"
  flock -n 9 || die "đang có tiến trình backup khác chạy"
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
FILE="$BACKUP_DIR/${PG_DB}_${STAMP}.dump"
TMP="$FILE.partial"
trap 'rm -f "$TMP"' EXIT

compose() { docker compose -f "$PROJECT_DIR/$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"; }

log "bắt đầu backup DB \"$PG_DB\" (mode=$MODE)"
case "$MODE" in
  docker)
    [[ -n "$(compose ps --status running -q postgres)" ]] || die "service postgres không chạy ($COMPOSE_FILE)"
    compose exec -T postgres pg_dump -U "$PG_USER" -d "$PG_DB" -Fc -Z 6 --no-owner > "$TMP"
    # Kiểm tra file đọc được (không bị cắt ngang) bằng pg_restore trong container
    compose exec -T postgres pg_restore --list < "$TMP" > /dev/null || die "file backup hỏng"
    ;;
  native)
    # Prisma thêm ?schema=public vào URL, libpq không hiểu -> bỏ phần query
    URL="$(cfg DATABASE_URL '')"; URL="${URL%%\?*}"
    [[ -n "$URL" ]] || die "chưa có DATABASE_URL"
    command -v pg_dump > /dev/null || die "chưa cài pg_dump (apt install postgresql-client-16)"
    pg_dump "$URL" -Fc -Z 6 --no-owner -f "$TMP"
    pg_restore --list "$TMP" > /dev/null || die "file backup hỏng"
    ;;
  *) die "BACKUP_MODE không hợp lệ: $MODE" ;;
esac

[[ -s "$TMP" ]] || die "file backup rỗng"
mv "$TMP" "$FILE"
(cd "$BACKUP_DIR" && sha256sum "$(basename "$FILE")") > "$FILE.sha256"
log "xong: $FILE ($(du -h "$FILE" | cut -f1))"

# Xóa bản cũ
DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -name "${PG_DB}_*.dump*" -mtime "+$RETENTION_DAYS" -print -delete | wc -l)
if (( DELETED > 0 )); then log "đã xóa $DELETED file cũ hơn $RETENTION_DAYS ngày"; fi

# Bản sao ngoài máy chủ (VPS hỏng ổ cứng thì backup cùng máy cũng mất)
if [[ -n "$RCLONE_REMOTE" ]]; then
  command -v rclone > /dev/null || die "đã đặt BACKUP_RCLONE_REMOTE nhưng chưa cài rclone"
  rclone copy "$FILE" "$RCLONE_REMOTE" && rclone copy "$FILE.sha256" "$RCLONE_REMOTE"
  log "đã đẩy lên $RCLONE_REMOTE"
fi

if [[ -n "$PING_URL" ]]; then
  curl -fsS -m 10 --retry 3 "$PING_URL" > /dev/null || log "không gọi được BACKUP_PING_URL"
fi
