// Chiến dịch email hàng loạt (Admin > Email Campaigns). Worker gọi processEmailCampaigns() mỗi phút:
// mỗi lượt gửi tối đa BATCH email rồi lưu vị trí (cursor), lượt sau gửi tiếp -> không vượt giới hạn SMTP
// (Gmail cá nhân ~500 email/ngày) và không chạy 1 job quá lâu.
import { prisma } from '@accszone/database';
import { fillTemplate, getEmailSettings, sendMail, smtpReady, unsubscribeToken } from './email';
import { getConfig } from './config';

const BATCH = 30;

interface Recipient {
  email: string;
  userId: string | null;
  username: string | null;
}

async function nextRecipients(c: { recipients: string; emails: string[]; cursor: string | null }): Promise<{ list: Recipient[]; cursor: string | null }> {
  if (c.recipients === 'all') {
    const users = await prisma.user.findMany({
      where: { status: 'ACTIVE', emailOptOut: false, ...(c.cursor && { id: { gt: c.cursor } }) },
      orderBy: { id: 'asc' },
      take: BATCH,
      select: { id: true, email: true, username: true },
    });
    return { list: users.map((u) => ({ email: u.email, userId: u.id, username: u.username })), cursor: users.at(-1)?.id ?? null };
  }
  // Danh sách email nhập tay: cursor = vị trí đã gửi tới
  const start = Number(c.cursor ?? 0);
  const slice = c.emails.slice(start, start + BATCH);
  const users = await prisma.user.findMany({ where: { email: { in: slice } }, select: { id: true, email: true, username: true, emailOptOut: true } });
  const byEmail = new Map(users.map((u) => [u.email, u]));
  const list = slice
    .filter((e) => !byEmail.get(e)?.emailOptOut) // đã hủy nhận tin thì bỏ qua
    .map((e) => ({ email: e, userId: byEmail.get(e)?.id ?? null, username: byEmail.get(e)?.username ?? null }));
  return { list, cursor: slice.length ? String(start + slice.length) : null };
}

export function countCampaignRecipients(recipients: string, emails: string[]) {
  return recipients === 'all' ? prisma.user.count({ where: { status: 'ACTIVE', emailOptOut: false } }) : Promise.resolve(emails.length);
}

export async function processEmailCampaigns(log: { info: (m: string) => void; warn: (m: string) => void }) {
  const campaign = await prisma.emailCampaign.findFirst({ where: { status: 'SENDING' }, orderBy: { createdAt: 'asc' } });
  if (!campaign) return { sent: 0 };
  const settings = await getEmailSettings();
  if (!smtpReady(settings)) {
    await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'PAUSED', lastError: 'SMTP chưa bật hoặc chưa cấu hình (Admin > Email)' } });
    return { sent: 0 };
  }
  let site = 'Shop';
  try {
    site = (await getConfig('site.general')).name;
  } catch {}

  const { list, cursor } = await nextRecipients(campaign);
  if (!cursor) {
    await prisma.emailCampaign.update({ where: { id: campaign.id }, data: { status: 'DONE' } });
    log.info(`campaign "${campaign.name}" done`);
    return { sent: 0 };
  }

  let sent = 0;
  let failed = 0;
  let lastError: string | null = null;
  for (const r of list) {
    const vars = { site, username: r.username ?? r.email, email: r.email };
    let html = fillTemplate(campaign.body, vars);
    const headers: Record<string, string> = {};
    if (r.userId && campaign.siteUrl) {
      const link = `${campaign.siteUrl.replace(/\/+$/, '')}/unsubscribe?u=${encodeURIComponent(r.userId)}&t=${unsubscribeToken(r.userId)}`;
      html += `<hr style="margin-top:24px;border:none;border-top:1px solid #e4e4e7"><p style="font-size:12px;color:#71717a">Bạn nhận email này vì đã đăng ký tài khoản tại ${fillTemplate('{site}', vars)}. <a href="${link}">Hủy nhận email thông báo</a>.</p>`;
      headers['List-Unsubscribe'] = `<${link}>`;
    }
    try {
      await sendMail({ to: r.email, subject: fillTemplate(campaign.subject, vars, false), html, cc: campaign.cc, bcc: campaign.bcc, headers }, settings);
      sent++;
    } catch (err) {
      failed++;
      lastError = `${r.email}: ${err instanceof Error ? err.message : String(err)}`.slice(0, 500);
    }
  }
  // Toàn bộ đợt đều lỗi (sai mật khẩu SMTP, bị chặn...) -> tạm dừng để admin kiểm tra, không đốt hết danh sách
  const allFailed = list.length > 0 && sent === 0;
  // Đợt cuối (danh sách hết / không đủ 1 đợt) -> đánh dấu xong ngay, không chờ lượt sau
  const finished = campaign.recipients === 'all' ? list.length < BATCH : Number(cursor) >= campaign.emails.length;
  await prisma.emailCampaign.update({
    where: { id: campaign.id },
    data: {
      sent: { increment: sent },
      failed: { increment: failed },
      ...(allFailed ? { status: 'PAUSED' } : { cursor, ...(finished && { status: 'DONE' }) }),
      ...(lastError && { lastError }),
    },
  });
  if (allFailed) log.warn(`campaign "${campaign.name}" paused: ${lastError}`);
  return { sent, failed };
}
