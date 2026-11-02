'use client';

import { useI18n } from '@/i18n/client';

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const { d } = useI18n();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">{d.pages.errorTitle}</h1>
      <p className="max-w-md text-sm text-zinc-500">{d.pages.errorText}</p>
      <button type="button" onClick={reset} className="btn-primary mt-2">{d.pages.retry}</button>
    </main>
  );
}
