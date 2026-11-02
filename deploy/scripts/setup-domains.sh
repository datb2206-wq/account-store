#!/usr/bin/env bash
# =============================================================
#  Cấp chứng chỉ Let's Encrypt và cấu hình Nginx cho 1 hoặc nhiều tên miền,
#  mọi đuôi quốc tế (.com, .co, .me, .info, .co.uk...).
#
#    sudo EMAIL=you@gmail.com deploy/scripts/setup-domains.sh shop.co shop.me shop.info
#
#  Tên miền ĐẦU TIÊN là tên miền chính; các tên miền còn lại chuyển hướng 301 về đó.
#  Chạy lại với danh sách mới để thêm tên miền, chứng chỉ được mở rộng tự động.
#  Trước khi chạy: trỏ bản ghi A của từng tên miền và www.<tên miền> về IP VPS.
#  Tên miền có dấu (IDN) phải nhập dạng punycode xn--...
# =============================================================
set -euo pipefail

[ "$(id -u)" -eq 0 ] || { echo "Cần chạy bằng sudo" >&2; exit 1; }
[ "$#" -ge 1 ] || { echo "Cách dùng: sudo EMAIL=you@gmail.com $0 domain-chinh.co [domain-phu.me ...]" >&2; exit 1; }
[ -n "${EMAIL:-}" ] || { echo "Thiếu biến EMAIL (Let's Encrypt gửi cảnh báo hết hạn về đây)" >&2; exit 1; }

for domain in "$@"; do
  if ! [[ "$domain" =~ ^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+([a-z]{2,}|xn--[a-z0-9-]+)$ ]]; then
    echo "Tên miền không hợp lệ: $domain (viết thường, không có http://)" >&2
    exit 1
  fi
done

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PRIMARY="$1"
EXTRAS=("${@:2}")
SITE=/etc/nginx/sites-available/accszone

ALL_NAMES=""
CERT_ARGS=()
for domain in "$@"; do
  ALL_NAMES+=" $domain www.$domain"
  CERT_ARGS+=(-d "$domain" -d "www.$domain")
done
EXTRA_NAMES="${ALL_NAMES#" $PRIMARY www.$PRIMARY"}"

# 1) Cấu hình tạm chỉ có HTTP để certbot xác minh tên miền
sed "s/server_name .*/server_name$ALL_NAMES;/" "$ROOT/deploy/nginx/bootstrap-http.conf" > "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/accszone
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

# 2) 1 chứng chỉ dùng chung cho mọi tên miền
certbot certonly --nginx --cert-name "$PRIMARY" --expand --non-interactive --agree-tos --no-eff-email -m "$EMAIL" "${CERT_ARGS[@]}"

# 3) Cấu hình HTTPS đầy đủ, tên miền phụ chuyển về tên miền chính
sed "s/example\.com/$PRIMARY/g" "$ROOT/deploy/nginx/accszone.conf" > "$SITE"
if [ "${#EXTRAS[@]}" -gt 0 ]; then
  cat >> "$SITE" <<NGINX

# ---------- Tên miền phụ -> tên miền chính (tạo bởi setup-domains.sh) ----------
server {
    listen 80;
    listen [::]:80;
    server_name$EXTRA_NAMES;
    return 301 https://$PRIMARY\$request_uri;
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name$EXTRA_NAMES;

    ssl_certificate     /etc/letsencrypt/live/$PRIMARY/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$PRIMARY/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;

    return 301 https://$PRIMARY\$request_uri;
}
NGINX
fi
nginx -t
systemctl reload nginx

echo "Xong: https://$PRIMARY (kiểm tra gia hạn tự động: certbot renew --dry-run)"
