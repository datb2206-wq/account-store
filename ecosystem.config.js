// =============================================================
//  PM2 — chạy web + BullMQ worker trên VPS KHÔNG dùng Docker cho app
//  (PostgreSQL/Redis vẫn có thể chạy bằng docker/docker-compose.yml).
//
//    pnpm install --frozen-lockfile && pnpm build && pnpm db:deploy
//    pm2 start ecosystem.config.js
//    pm2 save && pm2 startup        # tự chạy lại khi reboot VPS
//
//  Lệnh hay dùng: pm2 ls | pm2 logs accszone-worker | pm2 reload accszone-web
//  Đã dùng docker-compose.prod.yml thì KHÔNG cần file này (container lo việc restart).
// =============================================================
const path = require('node:path');

const ROOT = __dirname;
// Node >= 20.6 đọc .env trực tiếp, không cần dotenv-cli -> PM2 gửi tín hiệu thẳng vào tiến trình app
const ENV_FILE = `--env-file=${path.join(ROOT, '.env')}`;

/** Cấu hình chung: log có timestamp, restart lùi dần khi crash liên tục */
const common = {
  autorestart: true,
  exp_backoff_restart_delay: 200, // 200ms -> 400ms -> ... tối đa 15s, tránh vòng lặp crash
  max_restarts: 50,
  min_uptime: '10s',
  time: true,
  merge_logs: true,
  env: { NODE_ENV: 'production' },
};

module.exports = {
  apps: [
    {
      ...common,
      name: 'accszone-web',
      cwd: path.join(ROOT, 'apps/web'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3000 --hostname 127.0.0.1', // chỉ nhận request từ Nginx
      node_args: [ENV_FILE], // dạng mảng: đường dẫn có dấu cách không bị tách sai
      // Muốn tận dụng nhiều CPU: instances: 'max' + exec_mode: 'cluster' (Next hỗ trợ).
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      kill_timeout: 10_000,
      out_file: path.join(ROOT, 'logs/web.out.log'),
      error_file: path.join(ROOT, 'logs/web.err.log'),
    },
    {
      ...common,
      name: 'accszone-worker',
      cwd: path.join(ROOT, 'apps/worker'),
      script: 'src/index.ts',
      node_args: [ENV_FILE, '--import', 'tsx'],
      // Worker giữ lịch (job scheduler) trong Redis nên chạy 2 bản vẫn không trùng job,
      // nhưng 1 bản là đủ cho lưu lượng thường. Không dùng cluster mode cho worker.
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      // Khi stop/reload: chờ job đang chạy (đặt hàng web gốc, quét USDT) xong rồi mới kill
      kill_timeout: 60_000,
      out_file: path.join(ROOT, 'logs/worker.out.log'),
      error_file: path.join(ROOT, 'logs/worker.err.log'),
    },
  ],
};
