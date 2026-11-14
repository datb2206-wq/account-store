import { NextResponse } from 'next/server';
import { z } from 'zod';
import { countCampaignRecipients } from '@accszone/core';
import { prisma } from '@accszone/database';
import { adminRoute, badRequest, parseBody } from '@/lib/admin-route';
import { writeAudit } from '@/lib/audit';
import { getClientIp } from '@/lib/http';
import { getSiteUrl } from '@/lib/site';

const emailList = z
  .string()
  .default('')
  .transform((s) => [...new Set(s.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean))]);

const schema = z.object({
  name: z.string().trim().min(1, 'Nhập tên chiến dịch').max(150),
  subject: z.string().trim().min(1, 'Nhập tiêu đề email').max(300),
  body: z.string().trim().min(1, 'Nhập nội dung email').max(100_000),
  recipients: z.enum(['all', 'list']),
  emails: emailList,
  cc: z.string().trim().max(500).default(''),
  bcc: z.string().trim().max(500).default(''),
});

// Tạo chiến dịch: worker bắt đầu gửi ở lượt kế tiếp (mỗi phút 1 đợt)
export const POST = adminRoute(async (req, _ctx, user) => {
  const input = await parseBody(req, schema);
  if (input.recipients === 'list') {
    if (input.emails.length === 0) throw badRequest('Nhập ít nhất 1 email người nhận', { emails: ['Nhập ít nhất 1 email'] });
    const bad = input.emails.find((e) => !z.string().email().safeParse(e).success);
    if (bad) throw badRequest(`Email không hợp lệ: ${bad}`, { emails: [`Email không hợp lệ: ${bad}`] });
    if (input.emails.length > 50_000) throw badRequest('Tối đa 50.000 email mỗi chiến dịch');
  }
  const total = await countCampaignRecipients(input.recipients, input.emails);
  const campaign = await prisma.emailCampaign.create({
    data: { ...input, emails: input.recipients === 'list' ? input.emails : [], total, siteUrl: await getSiteUrl(), createdById: user.id },
    select: { id: true },
  });
  await writeAudit({ actorId: user.id, action: 'email_campaign.create', entity: 'EmailCampaign', entityId: campaign.id, after: { name: input.name, recipients: input.recipients, total }, ip: getClientIp(req) });
  return NextResponse.json({ campaign }, { status: 201 });
});
