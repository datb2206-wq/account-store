import Link from 'next/link';
import { getI18n } from '@/i18n/server';

export default async function NotFound() {
  const { d } = await getI18n();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-5xl font-bold text-zinc-300">404</p>
      <h1 className="text-xl font-semibold">{d.pages.notFoundTitle}</h1>
      <p className="max-w-md text-sm text-zinc-500">{d.pages.notFoundText}</p>
      <Link href="/" className="btn-primary mt-2">{d.pages.home}</Link>
    </main>
  );
}
