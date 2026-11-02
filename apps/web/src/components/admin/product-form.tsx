'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { apiRequest } from '@/lib/client-api';
import { slugify } from '@accszone/core/slugify';
import { DeleteButton } from './delete-button';
import { FormAlert, FormField } from './form-field';
import { I18nFields, type I18nText } from './i18n-fields';

export interface ProductFormValues {
  slug: string;
  categoryId: string;
  name: I18nText;
  description: I18nText;
  price: string;
  costPrice: string;
  minQty: number;
  maxQty: number;
  sortOrder: number;
  isActive: boolean;
}

const EMPTY: ProductFormValues = {
  slug: '',
  categoryId: '',
  name: {},
  description: {},
  price: '',
  costPrice: '',
  minQty: 1,
  maxQty: 1000,
  sortOrder: 0,
  isActive: true,
};

export function ProductForm({
  productId,
  initial,
  categoryOptions,
}: {
  productId?: string;
  initial?: ProductFormValues;
  categoryOptions: { id: string; label: string }[];
}) {
  const router = useRouter();
  const isEdit = !!productId;
  const [values, setValues] = useState<ProductFormValues>(initial ?? EMPTY);
  const [slugTouched, setSlugTouched] = useState(isEdit);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[] | undefined>>({});

  const set = <K extends keyof ProductFormValues>(key: K, value: ProductFormValues[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    setFields({});
    const res = await apiRequest<{ product: { id: string } }>(
      isEdit ? `/api/admin/products/${productId}` : '/api/admin/products',
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
      router.refresh();
    } else {
      // Tạo xong chuyển thẳng sang tab Kho để nhập hàng
      router.push(`/admin/products/${res.data.product.id}/stock`);
    }
  }

  const numberInput = (key: 'minQty' | 'maxQty' | 'sortOrder', label: string, hint?: string) => (
    <FormField label={label} htmlFor={`p-${key}`} error={fields[key]} hint={hint}>
      <input
        id={`p-${key}`}
        type="number"
        className="input"
        value={values[key]}
        onChange={(e) => set(key, Number(e.target.value))}
      />
    </FormField>
  );

  return (
    <form onSubmit={onSubmit} className="grid gap-6 lg:grid-cols-[1fr_320px]" noValidate>
      <div className="card space-y-4">
        <FormAlert error={error} success={success} />
        <I18nFields
          name={values.name}
          description={values.description}
          nameError={fields.name}
          descriptionRows={6}
          descriptionHint='Mô tả cho khách, nên ghi rõ định dạng giao hàng, VD: "login:pass:email:emailpass"'
          onChange={({ name, description }) =>
            setValues((v) => ({ ...v, name, description, slug: slugTouched ? v.slug : slugify(name.en ?? '') }))
          }
        />
        <FormField label="Slug (URL)" htmlFor="p-slug" error={fields.slug}>
          <input
            id="p-slug"
            className="input font-mono"
            value={values.slug}
            onChange={(e) => {
              setSlugTouched(true);
              set('slug', e.target.value);
            }}
          />
        </FormField>
      </div>

      <div className="space-y-4">
        <div className="card space-y-4">
          <FormField label="Danh mục" htmlFor="p-cat" error={fields.categoryId}>
            <select id="p-cat" className="input" value={values.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">— Chọn danh mục —</option>
              {categoryOptions.map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </FormField>
          <FormField label="Giá bán (USD)" htmlFor="p-price" error={fields.price}>
            <input id="p-price" inputMode="decimal" className="input" placeholder="0.50" value={values.price} onChange={(e) => set('price', e.target.value)} />
          </FormField>
          <FormField label="Giá vốn (USD)" htmlFor="p-cost" error={fields.costPrice} hint="Chỉ admin thấy, dùng tính lợi nhuận">
            <input id="p-cost" inputMode="decimal" className="input" placeholder="Không bắt buộc" value={values.costPrice} onChange={(e) => set('costPrice', e.target.value)} />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            {numberInput('minQty', 'Mua tối thiểu')}
            {numberInput('maxQty', 'Mua tối đa')}
          </div>
          {numberInput('sortOrder', 'Thứ tự', 'Nhỏ hiển thị trước')}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={values.isActive} onChange={(e) => set('isActive', e.target.checked)} />
            Đang bán (hiển thị cho khách)
          </label>
        </div>

        <div className="flex items-center justify-between gap-2">
          <button type="submit" className="btn-primary" disabled={pending}>
            {pending ? 'Đang lưu…' : isEdit ? 'Lưu thay đổi' : 'Tạo sản phẩm'}
          </button>
          {isEdit && (
            <DeleteButton
              url={`/api/admin/products/${productId}`}
              confirmText="Xóa sản phẩm này? TOÀN BỘ hàng trong kho của sản phẩm cũng bị xóa. Không thể hoàn tác."
              redirectTo="/admin/products"
            />
          )}
        </div>
      </div>
    </form>
  );
}
