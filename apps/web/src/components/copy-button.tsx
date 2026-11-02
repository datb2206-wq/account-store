'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/client';

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const { d } = useI18n();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="shrink-0 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          window.prompt(`${d.common.copy}:`, value);
        }
      }}
    >
      {copied ? d.common.copied : (label ?? d.common.copy)}
    </button>
  );
}
