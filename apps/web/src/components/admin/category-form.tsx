'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { apiRequest } from '@/lib/client-api';
import { slugify } from '@accszone/core/slugify';
import { DeleteButton } from './delete-button';
import { FormAlert, FormField } from './form-field';
import { I18nFields, type I18nText } from './i18n-fields';

export interface CategoryFormValues {
  slug: string;
  name: I18nText;
  description: I18nText;
  iconUrl: string;
  parentId: string;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY: CategoryFormValues = {
  slug: '',
  name: {},
  description: {},
  iconUrl: '',
  parentId: '',
  sortOrder: 0,
  isActive: true,
};

export function CategoryForm({
  categoryId,
  initial,
  parentOptions,
}: {
  categoryId?: string;
  initial?: CategoryFormValues;
  parentOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const isEdit = !!categoryId;
  const [values, setValues] = useState<CategoryFormValues>(initial ?? EMPTY);
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[] | undefined>>({});

  const set = <K extends keyof CategoryFormValues>(key: K, value: CategoryFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    setFields({});
    const res = await apiRequest(
      isEdit ? `/api/admin/categories/${categoryId}` : '/api/admin/categories',
      isEdit ? 'PATCH' : 'POST',
      values,
    );
    setPending(false);
    if (!res.ok) {
      setError(res.data.error ?? 'Lưu thất bại');
      setFields(res.data.fields ?? {});
      return;
    }
    if (isEdit) {
      setSuccess('Đã lưu thay đổi');
    } else {
      setValues(EMPTY);
      setSlugTouched(false);
      setSuccess('Đã tạo danh mục');
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4" noValidate>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{isEdit ? 'Sửa danh mục' : 'Thêm danh mục'}</h2>
        {isEdit && <Link href="/admin/categories" className="text-sm text-zinc-500 hover:underline">+ Thêm mới</Link>}
      </div>

      <FormAlert error={error} success={success} />

      <I18nFields
        name={values.name}
        description={values.description}
        nameError={fields.name}
        onChange={({ name, description }) => {
          setValues((v) => ({
            ...v,
            name,
            description,
            slug: slugTouched ? v.slug : slugify(name.en ?? ''),
          }));
        }}
      />

      <FormField label="Slug (URL)" htmlFor="cat-slug" error={fields.slug}>
        <input
          id="cat-slug"
          className="input font-mono"
          value={values.slug}
          onChange={(e) => {
            setSlugTouched(true);
            set('slug', e.target.value);
          }}
        />
      </FormField>

      <FormField label="Danh mục cha" htmlFor="cat-parent" error={fields.parentId}>
        <select id="cat-parent" className="input" value={values.parentId} onChange={(e) => set('parentId', e.target.value)}>
          <option value="">— Không có (danh mục gốc) —</option>
          {parentOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </FormField>

      <FormField label="Icon URL" htmlFor="cat-icon" error={fields.iconUrl}>
        <input id="cat-icon" className="input" placeholder="https://…" value={values.iconUrl} onChange={(e) => set('iconUrl', e.target.value)} />
      </FormField>

      <div className="grid grid-cols-2 gap-3">
        <FormField label="Thứ tự" htmlFor="cat-sort" error={fields.sortOrder} hint="Nhỏ hiển thị trước">
          <input
            id="cat-sort"
            type="number"
            className="input"
            value={values.sortOrder}
            onChange={(e) => set('sortOrder', Number(e.target.value))}
          />
        </FormField>
        <label className="mt-6 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={values.isActive} onChange={(e) => set('isActive', e.target.checked)} />
          Hiển thị
        </label>
      </div>

      <div className="flex items-center justify-between gap-2">
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : 'Tạo danh mục'}
        </button>
        {isEdit && (
          <DeleteButton
            url={`/api/admin/categories/${categoryId}`}
            confirmText="Xóa danh mục này? Danh mục con (nếu có) sẽ thành danh mục gốc."
            redirectTo="/admin/categories"
          />
        )}
      </div>
    </form>
  );
}
