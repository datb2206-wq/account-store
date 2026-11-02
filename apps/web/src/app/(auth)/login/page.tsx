import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { getI18n } from '@/i18n/server';
import { safeNext } from '@/lib/safe-next';

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.meta.signIn };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="login" next={safeNext(next)} />;
}
