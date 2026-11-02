import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { getI18n } from '@/i18n/server';
import { safeNext } from '@/lib/safe-next';

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.meta.register };
}

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="register" next={safeNext(next)} />;
}
