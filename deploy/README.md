# Hướng dẫn deploy production

Có 2 cách chạy. Chọn **một**:

| | Cách A — Docker Compose (khuyên dùng) | Cách B — PM2 |
|---|---|---|
| PostgreSQL, Redis | container | container (`docker/docker-compose.yml`) hoặc cài thẳng |
| Web + Worker | container, tự restart | PM2 (`ecosystem.config.js`) |
| Cập nhật code | `docker compose ... up -d --build` | `git pull && pnpm build && pm2 reload all` |

Cả hai đều đặt **Nginx trên máy chủ** phía trước để lo HTTPS.

Yêu cầu VPS: Ubuntu 22.04/24.04, tối thiểu 2 GB RAM (build Next.js ngốn ~1.5 GB, máy 1 GB cần thêm swap). Nên chọn VPS ổ **NVMe**: PostgreSQL đã được cấu hình sẵn cho loại ổ này (xem [Tối ưu PostgreSQL](#tối-ưu-postgresql-vps-nvme)).

### Tối ưu PostgreSQL (VPS NVMe)

Cả 2 file compose khởi động PostgreSQL với thông số cho ổ NVMe và kho hàng lớn:

- `random_page_cost=1.1`, `effective_io_concurrency=200`: NVMe đọc ngẫu nhiên gần nhanh như đọc tuần tự, nên PostgreSQL ưu tiên dùng index (lấy hàng trong kho hàng triệu dòng chỉ đọc vài trang thay vì quét cả bảng).
- `wal_compression`, `max_wal_size=2GB`, `checkpoint_completion_target=0.9`: nhập kho số lượng lớn ghi đĩa đều hơn, không bị khựng theo đợt.
- `jit=off`: truy vấn của shop đều ngắn, JIT chỉ làm chậm thêm.

Phần bộ nhớ đặt trong `.env` theo RAM của VPS. Web, worker và Redis cũng cần RAM nên không cấp hết cho PostgreSQL:

| RAM VPS | `PG_SHARED_BUFFERS` | `PG_EFFECTIVE_CACHE_SIZE` | `PG_WORK_MEM` | `PG_MAINTENANCE_WORK_MEM` |
|---|---|---|---|---|
| 2 GB (mặc định) | `256MB` | `1GB` | `8MB` | `128MB` |
| 4 GB | `768MB` | `2GB` | `16MB` | `256MB` |
| 8 GB | `2GB` | `5GB` | `32MB` | `512MB` |
| 16 GB | `4GB` | `11GB` | `32MB` | `1GB` |

Đổi xong chạy lại container PostgreSQL (dữ liệu nằm trong volume, không mất): `docker compose -f docker/docker-compose.prod.yml --env-file .env up -d postgres`. Kiểm tra: `docker compose -f docker/docker-compose.prod.yml exec postgres psql -U <user> -c "SHOW shared_buffers"`.

---

## 0. Chuẩn bị chung

```bash
# Docker + Nginx + Certbot
curl -fsSL https://get.docker.com | sh
sudo apt install -y nginx certbot python3-certbot-nginx

# Tường lửa: chỉ mở SSH + HTTP/HTTPS (DB, Redis, cổng 3000 KHÔNG mở ra ngoài)
sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable

# Code
sudo mkdir -p /opt/accszone && sudo chown $USER /opt/accszone
git clone <repo> /opt/accszone && cd /opt/accszone
cp .env.example .env && chmod 600 .env
```

> ⚠️ Docker publish port **bỏ qua UFW**. File compose của dự án đã bind `127.0.0.1` hết, đừng đổi thành `0.0.0.0`.

Sửa `.env` cho production:

```bash
NODE_ENV=production
# Sinh từng khóa (mỗi khóa 1 lần chạy):
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
#  -> JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ENCRYPTION_KEY, BANK_WEBHOOK_SECRET
# Mật khẩu DB/Redis: chỉ dùng chữ + số (tránh ký tự phải mã hóa trong URL)
POSTGRES_PASSWORD=...
REDIS_PASSWORD=...
```

- **Chuyển dữ liệu từ máy dev:** phải dùng **đúng `ENCRYPTION_KEY` cũ**, nếu không kho hàng không giải mã được.
- **Cất bản sao `.env` ở nơi an toàn**, tách khỏi VPS và khỏi chỗ để backup.

---

## Cách A — Docker Compose

```bash
cd /opt/accszone
docker compose -f docker/docker-compose.prod.yml --env-file .env up -d --build
```

Lệnh này lần lượt:

1. build image;
2. khởi động `postgres` + `redis`;
3. chạy `migrate` (`prisma migrate deploy`);
4. khởi động `web` (cổng `127.0.0.1:3000`) và `worker`.

Lần đầu: tạo Super Admin và các cấu hình mặc định. Có dấu cách ở đầu dòng để mật khẩu không bị lưu vào history của shell:

```bash
 docker compose -f docker/docker-compose.prod.yml --env-file .env run --rm \
  -e SEED_ADMIN_EMAIL='admin@example.com' -e SEED_ADMIN_PASSWORD='mat-khau-manh' \
  migrate node_modules/.bin/tsx prisma/seed.ts
```

Gợi ý tạo alias cho gọn: `alias dc='docker compose -f docker/docker-compose.prod.yml --env-file .env'`

| Việc | Lệnh |
|---|---|
| Xem trạng thái | `dc ps` |
| Xem log | `dc logs -f web worker` |
| Cập nhật code | `git pull && dc up -d --build` (migration tự chạy) |
| Restart worker | `dc restart worker` |
| Kiểm tra sức khỏe | `curl -s localhost:3000/api/health` → `{"ok":true,...}` |

---

## Cách B — PM2

```bash
# Node 20 + pnpm + PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
sudo corepack enable && sudo npm i -g pm2

cd /opt/accszone
pnpm infra:up                       # PostgreSQL + Redis (docker/docker-compose.yml)
pnpm install --frozen-lockfile
pnpm build
pnpm db:deploy                      # migration
pnpm db:seed                        # chỉ lần đầu: tạo Super Admin

mkdir -p logs
pm2 start ecosystem.config.js
pm2 save && pm2 startup             # chạy lệnh mà pm2 startup in ra để tự khởi động khi reboot
pm2 install pm2-logrotate           # xoay vòng log
```

Cập nhật code:

```bash
git pull && pnpm install --frozen-lockfile && pnpm build && pnpm db:deploy && pm2 reload ecosystem.config.js
```

Theo dõi: `pm2 ls`, `pm2 logs accszone-worker`, `pm2 monit`.

---

## Nginx + SSL (Let's Encrypt)

Trỏ bản ghi DNS **A** của `example.com` và `www.example.com` về IP VPS trước, rồi:

```bash
DOMAIN=example.com    # tên miền thật

# 1) Cấu hình tạm chỉ có HTTP để certbot xác minh tên miền
sudo sed "s/example.com/$DOMAIN/g" deploy/nginx/bootstrap-http.conf | sudo tee /etc/nginx/sites-available/accszone > /dev/null
sudo ln -sf /etc/nginx/sites-available/accszone /etc/nginx/sites-enabled/accszone
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 2) Lấy chứng chỉ
sudo certbot certonly --nginx -d $DOMAIN -d www.$DOMAIN -m you@$DOMAIN --agree-tos --no-eff-email

# 3) Thay bằng cấu hình HTTPS đầy đủ
sudo sed "s/example.com/$DOMAIN/g" deploy/nginx/accszone.conf | sudo tee /etc/nginx/sites-available/accszone > /dev/null
sudo nginx -t && sudo systemctl reload nginx

# 4) Kiểm tra gia hạn tự động (certbot cài sẵn systemd timer, chạy 2 lần/ngày)
sudo certbot renew --dry-run
systemctl list-timers | grep certbot
```

Nginx chỉ cần reload khi có chứng chỉ mới. Certbot `--nginx` làm việc này tự động; nếu muốn chắc chắn thì thêm hook:

```bash
echo -e '#!/bin/sh\nsystemctl reload nginx' | sudo tee /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

### Nhiều tên miền (.co, .me, .info...)

Script `deploy/scripts/setup-domains.sh` thay cho các bước 1–3 ở trên, chạy được với mọi đuôi tên miền. Tên miền đầu tiên là tên miền chính, các tên miền còn lại chuyển hướng 301 về đó và dùng chung 1 chứng chỉ:

```bash
chmod +x deploy/scripts/*.sh
sudo EMAIL=you@gmail.com deploy/scripts/setup-domains.sh shop.co shop.me shop.info
```

Trước khi chạy, trỏ bản ghi A của từng tên miền và `www.<tên miền>` về IP VPS. Muốn thêm tên miền thì chạy lại với danh sách đầy đủ. Tên miền có dấu phải nhập dạng punycode (`xn--...`).

Cấu hình mẫu đã có sẵn:

- chuyển HTTP → HTTPS và www → tên miền chính;
- HTTP/2, HSTS và các security header;
- gzip, cache 1 năm cho `/_next/static`;
- giới hạn tần suất cho `/api/auth/login|register` và `/api/*`;
- chặn `/api/health` từ bên ngoài.

### Ghi IP thật của khách

App lấy IP từ `X-Forwarded-For` để rate limit. Cấu hình mẫu **ghi đè** header này bằng `$remote_addr` để khách không giả mạo được.

**Nếu dùng Cloudflare (proxy cam)** thì `$remote_addr` là IP của Cloudflare. Cần thêm vào khối `http {}` trong `/etc/nginx/nginx.conf`:

```nginx
# Danh sách đầy đủ: https://www.cloudflare.com/ips/  (cập nhật định kỳ)
set_real_ip_from 173.245.48.0/20;
set_real_ip_from 103.21.244.0/22;
set_real_ip_from 103.22.200.0/22;
set_real_ip_from 103.31.4.0/22;
set_real_ip_from 141.101.64.0/18;
set_real_ip_from 108.162.192.0/18;
set_real_ip_from 190.93.240.0/20;
set_real_ip_from 188.114.96.0/20;
set_real_ip_from 197.234.240.0/22;
set_real_ip_from 198.41.128.0/17;
set_real_ip_from 162.158.0.0/15;
set_real_ip_from 104.16.0.0/13;
set_real_ip_from 104.24.0.0/14;
set_real_ip_from 172.64.0.0/13;
set_real_ip_from 131.0.72.0/22;
real_ip_header CF-Connecting-IP;
```

Với Cloudflare, đặt SSL mode là **Full (strict)**.

### Webhook ngân hàng

URL cho Casso/SePay: `https://example.com/api/webhooks/bank`, header `x-webhook-secret: <BANK_WEBHOOK_SECRET>`.

---

## Backup PostgreSQL

```bash
chmod +x deploy/scripts/*.sh
sudo mkdir -p /var/backups/accszone && sudo chown $USER /var/backups/accszone

deploy/scripts/backup-db.sh          # chạy thử
crontab -e                           # thêm dòng dưới: 3h sáng mỗi ngày
0 3 * * * /opt/accszone/deploy/scripts/backup-db.sh >> /var/log/accszone-backup.log 2>&1
```

Mỗi lần chạy, script:

- tạo `accszone_YYYYmmdd_HHMMSS.dump` (pg_dump custom format, đã nén) kèm file `.sha256`;
- kiểm tra file đọc lại được;
- xóa bản cũ hơn `BACKUP_RETENTION_DAYS` (mặc định 14 ngày).

Các tùy chọn sau đặt trong `.env`:

| Biến | Ý nghĩa |
|---|---|
| `BACKUP_DIR` | Thư mục lưu (mặc định `/var/backups/accszone`) |
| `BACKUP_RETENTION_DAYS` | Số ngày giữ bản backup |
| `BACKUP_COMPOSE_FILE` | **Cách B** đặt `docker/docker-compose.yml` |
| `BACKUP_MODE` | `native` nếu PostgreSQL cài thẳng trên máy (cần `postgresql-client-16`) |
| `BACKUP_RCLONE_REMOTE` | VD `b2:bucket/accszone`. Nên có bản sao ngoài VPS ([cài rclone](https://rclone.org/install/), chạy `rclone config`) |
| `BACKUP_PING_URL` | URL [healthchecks.io](https://healthchecks.io), báo cho bạn biết khi backup ngừng chạy |

Khôi phục (ghi đè DB; script tự dừng rồi chạy lại web/worker ở Cách A):

```bash
deploy/scripts/restore-db.sh /var/backups/accszone/accszone_20261028_030000.dump
```

> **Hãy thử khôi phục định kỳ.** Một bản backup chưa từng khôi phục thử thì chưa chắc đã dùng được.

**Ảnh biên lai chuyển khoản** không nằm trong DB mà ở `UPLOAD_DIR` (Docker: volume `uploads`; PM2: `apps/web/uploads`). Nên sao lưu thư mục này cùng lịch, ví dụ:

```bash
# Docker
docker run --rm -v accszone_uploads:/data -v /var/backups/accszone:/out alpine tar czf /out/uploads_$(date +%F).tgz -C /data .
# PM2
tar czf /var/backups/accszone/uploads_$(date +%F).tgz -C /opt/accszone/apps/web uploads
```

## Kết nối API nguồn AccsZone

Admin > Nhà cung cấp > Thêm: chọn định dạng **AccsZone API v1**, base URL `https://accszone.com/api/v1`, dán API key (bắt đầu bằng `acz_`) và đặt hệ số giá. Bấm **Đồng bộ ngay**, rồi bật bán từng sản phẩm ở trang Sản phẩm vì sản phẩm mới luôn ở trạng thái ẩn.

- Web gốc giới hạn 30 request/phút nên mỗi trang catalog cách nhau hơn 2 giây; 1.000 sản phẩm (50 trang) mất khoảng 2 phút. Đổi độ trễ bằng `ACCSZONE_PAGE_DELAY_MS`.
- Tài khoản bên web gốc phải luôn đủ số dư. Thiếu số dư thì đơn của khách bị từ chối và hoàn tiền tự động.

## Tỷ giá tự động (tùy chọn)

Đặt `FX_RATES_URL=https://open.er-api.com/v6/latest/USD` trong `.env` rồi khởi động lại worker: tỷ giá `currency.rates` được cập nhật mỗi `FX_UPDATE_HOURS` giờ (mặc định 6). Tỷ giá dùng cho **giá quy đổi hiển thị** (≈ Rp / ₽ / ¥) và **quy đổi tiền nạp ngân hàng sang USD**. Mã tiền đổi quá 30% trong 1 lần sẽ bị bỏ qua và ghi cảnh báo vào log worker — kiểm tra rồi tự sửa trong Admin nếu đúng là tỷ giá đã biến động mạnh.

---

## Checklist trước khi mở bán

- [ ] `.env`: `NODE_ENV=production`, mọi secret sinh ngẫu nhiên, `chmod 600`
- [ ] `ENCRYPTION_KEY` đã được cất bản sao an toàn ngoài VPS
- [ ] `curl https://example.com/api/health` từ ngoài trả 403 (đã chặn), còn `curl localhost:3000/api/health` trên VPS trả `ok:true`
- [ ] Đăng nhập Admin, đổi mật khẩu seed, cấu hình `site.general`, ví USDT, tài khoản ngân hàng
- [ ] Đã có cron backup và đã thử khôi phục 1 lần
- [ ] Đã sao lưu cả thư mục ảnh biên lai (`uploads`)
- [ ] `sudo certbot renew --dry-run` thành công
