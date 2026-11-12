// Schema cho các trang Admin: mã giảm giá, khuyến mãi nạp, block IP, blog.
// Form gửi mọi giá trị dạng chuỗi -> chuỗi rỗng = không đặt.
import { isIP } from 'node:net';
import { z } from 'zod';

const empty = (v: unknown) => (v === '' || v === null ? undefined : v);
const money = (label: string) =>
  z.string().regex(/^\d+(\.\d{1,6})?$/, `${label} không hợp lệ`).refine((v) => Number(v) > 0, `${label} phải lớn hơn 0`);
const optionalMoney = (label: string) => z.preprocess(empty, money(label).optional());
const percent = z.coerce.number({ invalid_type_error: 'Nhập số %' }).gt(0, 'Phải lớn hơn 0').max(100, 'Tối đa 100%');
const slug = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Chỉ dùng chữ thường không dấu, số và dấu -').max(120);
// Ngày hết hạn dạng YYYY-MM-DD: hết hạn vào cuối ngày đó (giờ VN)
const endOfDay = z.preprocess(
  empty,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày không hợp lệ').transform((d) => new Date(`${d}T23:59:59+07:00`)).optional(),
);

export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,40}$/, '3–40 ký tự: chữ, số, _ hoặc -'),
  discountPercent: percent,
  maxDiscount: optionalMoney('Giảm tối đa'),
  minOrder: optionalMoney('Đơn tối thiểu'),
  maxUses: z.coerce.number().int('Nhập số nguyên').min(1, 'Ít nhất 1 lượt').max(1_000_000),
  expiresAt: endOfDay,
  productIds: z.array(z.string().min(1).max(50)).max(500).default([]),
  isActive: z.boolean().default(true),
});

export const depositBonusSchema = z.object({
  minAmount: money('Số tiền nạp tối thiểu'),
  bonusPercent: percent,
  isActive: z.boolean().default(true),
});

export const blockIpSchema = z.object({
  ip: z.string().trim().refine((v) => isIP(v) !== 0, 'Địa chỉ IP không hợp lệ'),
  reason: z.string().trim().min(1, 'Nhập lý do').max(200),
  days: z.preprocess(empty, z.coerce.number().int().min(1).max(3650).optional()),
});

export const blogCategorySchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên chuyên mục').max(100),
  slug,
  sortOrder: z.preprocess(empty, z.coerce.number().int().default(0)),
  isActive: z.boolean().default(true),
});

export const blogPostSchema = z.object({
  title: z.string().trim().min(3, 'Tiêu đề quá ngắn').max(200),
  slug,
  // undefined -> null để khi sửa bài có thể xóa trắng các trường này
  excerpt: z.preprocess(empty, z.string().trim().max(400).optional()).transform((v) => v ?? null),
  content: z.string().trim().min(10, 'Nội dung quá ngắn').max(100_000),
  coverUrl: z.preprocess(empty, z.string().trim().url('Link ảnh không hợp lệ').regex(/^https:\/\//, 'Link ảnh phải bắt đầu bằng https://').max(500).optional()).transform((v) => v ?? null),
  categoryId: z.preprocess(empty, z.string().max(50).optional()).transform((v) => v ?? null),
  isPublished: z.boolean().default(true),
});

export const toggleSchema = z.object({ isActive: z.boolean() });
