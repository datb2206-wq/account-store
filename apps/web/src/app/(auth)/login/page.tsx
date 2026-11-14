import type { Metadata } from 'next';
import { AuthForm } from '@/components/auth-form';
import { getI18n } from '@/i18n/server';
import { safeNext } from '@/lib/safe-next';
import { captchaActive, getSecurity } from '@/lib/security';

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getI18n();
  return { title: d.meta.signIn };
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const [{ next }, security] = await Promise.all([searchParams, getSecurity()]);
  const captchaSiteKey = captchaActive(security, 'login') ? security.captcha.siteKey : undefined;
  return <AuthForm mode="login" next={safeNext(next)} captchaSiteKey={captchaSiteKey} />;
}
