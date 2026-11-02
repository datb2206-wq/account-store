'use client';

import { useState } from 'react';
import { LOCALES, type LocaleCode } from '@/lib/admin-schemas';

export type I18nText = Partial<Record<LocaleCode, string>>;

const LABELS: Record<LocaleCode, string> = { en: 'English', id: 'Indonesia', ru: 'Русский', zh: '中文' };

// Tên + mô tả theo 4 ngôn ngữ, chuyển qua lại bằng tab. EN bắt buộc (dùng làm fallback).
export function I18nFields({
  name,
  description,
  onChange,
  nameError,
  descriptionRows = 3,
  descriptionHint,
}: {
  name: I18nText;
  description: I18nText;
  onChange: (next: { name: I18nText; description: I18nText }) => void;
  nameError?: string[];
  descriptionRows?: number;
  descriptionHint?: string;
}) {
  const [locale, setLocale] = useState<LocaleCode>('en');

  return (
    <div className="space-y-3 rounded-lg border border-zinc-200 p-3">
      <div className="flex gap-1">
        {LOCALES.map((l) => (
          <button
            key={l}
            type="button"
            onClick={() => setLocale(l)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              locale === l ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:bg-zinc-100'
            }`}
          >
            {l.toUpperCase()}
            {l === 'en' && ' *'}
            {l !== 'en' && name[l] && ' ✓'}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-zinc-400">{LABELS[locale]}</span>
      </div>

      <div>
        <label htmlFor={`name-${locale}`} className="label">Tên ({locale.toUpperCase()})</label>
        <input
          id={`name-${locale}`}
          className="input"
          value={name[locale] ?? ''}
          aria-invalid={locale === 'en' && nameError ? true : undefined}
          onChange={(e) => onChange({ name: { ...name, [locale]: e.target.value }, description })}
        />
        {locale === 'en' && nameError?.[0] && <p className="mt-1 text-xs text-red-600">{nameError[0]}</p>}
      </div>

      <div>
        <label htmlFor={`desc-${locale}`} className="label">Mô tả ({locale.toUpperCase()})</label>
        <textarea
          id={`desc-${locale}`}
          className="input"
          rows={descriptionRows}
          value={description[locale] ?? ''}
          onChange={(e) => onChange({ name, description: { ...description, [locale]: e.target.value } })}
        />
        {descriptionHint && <p className="mt-1 text-xs text-zinc-400">{descriptionHint}</p>}
      </div>
    </div>
  );
}
