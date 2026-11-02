import { getI18n } from '@/i18n/server';

export async function MaintenanceScreen() {
  const { d } = await getI18n();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">{d.pages.maintenanceTitle}</h1>
      <p className="max-w-md text-sm text-zinc-500">{d.pages.maintenanceText}</p>
    </main>
  );
}
