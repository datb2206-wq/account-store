import { z } from 'zod';
import { isPermission } from './permissions';

export const adminRoleSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên vai trò').max(50),
  description: z.string().trim().max(200).default(''),
  permissions: z.array(z.string()).max(100).transform((ps) => [...new Set(ps.filter(isPermission))]),
});

// Gán vai trò cho thành viên: USER = khách thường; STAFF = nhân viên (adminRoleId null = quyền nhân viên mặc định)
export const userRoleSchema = z.object({
  role: z.enum(['USER', 'STAFF']),
  adminRoleId: z.string().trim().min(1).nullish(),
});
