import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Invalid email address').max(254);

// bcrypt chỉ dùng 72 byte đầu -> chặn mật khẩu dài hơn để tránh hiểu nhầm
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine((s) => new TextEncoder().encode(s).length <= 72, 'Password is too long');

const username = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? undefined : v),
  z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9_]{3,20}$/, '3–20 characters: letters, numbers, underscore')
    .optional(),
);

export const registerSchema = z.object({ email, password, username });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(200),
});

export const orderSchema = z.object({
  productId: z.string().min(1).max(50),
  quantity: z.coerce.number().int('Quantity must be a whole number').min(1).max(100_000),
});

export const bankDepositSchema = z.object({
  accountIndex: z.coerce.number().int().min(0).max(19),
  amount: z.preprocess(
    (v) => (typeof v === 'number' ? String(v) : v),
    z.string().trim().regex(/^\d{1,15}(\.\d{1,2})?$/, 'Enter a valid amount'),
  ),
});

export const usdtDepositSchema = z.object({
  network: z.enum(['TRC20', 'BEP20']),
  amount: z.coerce.number().int('Whole USDT amounts only (e.g. 25)').min(1).max(100_000),
});

export const verifyDepositSchema = z.object({
  txHash: z.string().trim().max(100).optional(),
});

// Client tự sinh (UUID) mỗi lần mở form mua; gửi lại đúng key khi retry
export const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9_-]{8,100}$/;

export function fieldErrors(error: z.ZodError) {
  return error.flatten().fieldErrors;
}
