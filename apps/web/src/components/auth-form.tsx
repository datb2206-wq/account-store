'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useI18n } from '@/i18n/client';
import { translateError } from '@/i18n/errors';

type Field = 'email' | 'password' | 'username' | 'confirmPassword';
type FieldErrors = Partial<Record<Field, string[]>>;

export function AuthForm({ mode, next }: { mode: 'login' | 'register'; next: string | null }) {
  const router = useRouter();
  const { d } = useI18n();
  const t = d.auth;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<FieldErrors>({});
  const isRegister = mode === 'register';

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setFields({});

    const body = Object.fromEntries(new FormData(e.currentTarget)) as Record<Field, string>;
    if (isRegister && body.password !== body.confirmPassword) {
      setFields({ confirmPassword: [d.errors.passwordMismatch] });
      return;
    }

    setPending(true);
    try {
      const res = await fetch(`/api/auth/${mode}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ? translateError(data.error, d) : t.genericError);
        // Lỗi từng ô cũng là tiếng Anh từ server -> dịch luôn
        setFields(
          Object.fromEntries(
            Object.entries((data.fields ?? {}) as FieldErrors).map(([k, v]) => [k, v?.map((m) => translateError(m, d))]),
          ),
        );
        return;
      }
      router.replace(next ?? (data.user.role === 'USER' ? '/dashboard' : '/admin'));
      router.refresh();
    } catch {
      setError(d.errors.network);
    } finally {
      setPending(false);
    }
  }

  const query = next ? `?next=${encodeURIComponent(next)}` : '';

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold">{isRegister ? t.registerTitle : t.loginTitle}</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {isRegister ? t.registerSubtitle : t.loginSubtitle}
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <Input name="email" type="email" label={t.email} autoComplete="email" errors={fields.email} />
      {isRegister && (
        <Input name="username" label={t.username} autoComplete="username" errors={fields.username} />
      )}
      <Input
        name="password"
        type="password"
        label={t.password}
        autoComplete={isRegister ? 'new-password' : 'current-password'}
        errors={fields.password}
      />
      {isRegister && (
        <Input
          name="confirmPassword"
          type="password"
          label={t.confirmPassword}
          autoComplete="new-password"
          errors={fields.confirmPassword}
        />
      )}

      <button type="submit" className="btn-primary w-full" disabled={pending}>
        {pending ? <span key="w">{t.wait}</span> : <span key="s">{isRegister ? t.createAccount : t.signIn}</span>}
      </button>

      <p className="text-center text-sm text-zinc-500">
        {isRegister ? t.haveAccount : t.noAccount}{' '}
        <Link href={(isRegister ? '/login' : '/register') + query} className="font-medium text-blue-600 hover:underline">
          {isRegister ? t.signIn : t.createOne}
        </Link>
      </p>
    </form>
  );
}

function Input({
  label,
  errors,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { name: Field; label: string; errors?: string[] }) {
  const id = `field-${props.name}`;
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input id={id} className="input" aria-invalid={errors ? true : undefined} {...props} />
      {errors?.[0] && <p className="mt-1 text-xs text-red-600">{errors[0]}</p>}
    </div>
  );
}
