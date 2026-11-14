'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '@/lib/client-api';
import { PERMISSION_GROUPS } from '@/lib/permissions';
import { DeleteButton } from './delete-button';
import { FormAlert } from './form-field';

const ALL = PERMISSION_GROUPS.flatMap((g) => g.items.map(([p]) => p as string));

// Tạo / sửa vai trò: tên, mô tả và tích chọn quyền theo từng nhóm
export function RoleForm({ role }: { role?: { id: string; name: string; description: string; permissions: string[] } }) {
  const router = useRouter();
  const [name, setName] = useState(role?.name ?? '');
  const [description, setDescription] = useState(role?.description ?? '');
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? []));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (keys: string[], on: boolean) =>
    setPerms((s) => {
      const next = new Set(s);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const body = { name, description, permissions: [...perms] };
    const res = role ? await apiRequest(`/api/admin/roles/${role.id}`, 'PATCH', body) : await apiRequest('/api/admin/roles', 'POST', body);
    setPending(false);
    if (!res.ok) {
      setError(res.data.fields?.name?.[0] ?? res.data.error ?? 'Lưu thất bại');
      return;
    }
    router.push('/admin/roles');
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <FormAlert error={error} />
      <div className="grid gap-4 md:grid-cols-2">
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Tên vai trò *</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Hỗ trợ khách hàng" maxLength={50} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block font-medium text-zinc-700">Mô tả</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="VD: Xem đơn, duyệt nạp tiền" maxLength={200} />
        </label>
      </div>

      <div className="rounded-xl border border-zinc-200">
        <label className="flex items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-4 py-3 text-sm font-semibold">
          <input type="checkbox" checked={perms.size === ALL.length} onChange={(e) => toggle(ALL, e.target.checked)} />
          Chọn tất cả các quyền <span className="font-normal text-zinc-400">({perms.size}/{ALL.length})</span>
        </label>
        <div className="divide-y divide-zinc-100">
          {PERMISSION_GROUPS.map((g) => {
            const keys = g.items.map(([p]) => p as string);
            const all = keys.every((k) => perms.has(k));
            return (
              <div key={g.group} className="grid gap-2 px-4 py-3 sm:grid-cols-[180px_1fr]">
                <label className="flex items-center gap-2 text-sm font-medium text-zinc-800">
                  <input type="checkbox" checked={all} onChange={(e) => toggle(keys, e.target.checked)} />
                  {g.group}
                </label>
                <div className="space-y-1.5">
                  {g.items.map(([key, label]) => (
                    <label key={key} className="flex flex-wrap items-center gap-2 text-sm text-zinc-700">
                      <input type="checkbox" checked={perms.has(key)} onChange={(e) => toggle([key], e.target.checked)} />
                      {label}
                      <code className="rounded bg-violet-50 px-1.5 text-[11px] text-violet-700">{key}</code>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>{pending ? 'Đang lưu…' : role ? 'Lưu vai trò' : '+ Tạo vai trò'}</button>
        {role && (
          <DeleteButton
            url={`/api/admin/roles/${role.id}`}
            redirectTo="/admin/roles"
            confirmText={`Xóa vai trò "${role.name}"? Nhân viên đang giữ vai trò này sẽ bị hạ về khách thường.`}
          />
        )}
      </div>
    </form>
  );
}
