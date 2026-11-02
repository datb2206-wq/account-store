'use client';

import { useState } from 'react';
import { useI18n } from '@/i18n/client';

export function DeliveryBox({ items, orderCode }: { items: string[]; orderCode: string }) {
  const { d } = useI18n();
  const [copied, setCopied] = useState(false);
  const text = items.join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt(d.delivery.copyPrompt, text);
    }
  }

  return (
    <div className="space-y-2">
      <textarea
        readOnly
        value={text}
        rows={Math.min(10, Math.max(3, items.length))}
        spellCheck={false}
        onFocus={(e) => e.currentTarget.select()}
        className="input font-mono text-xs"
      />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="btn-ghost border border-zinc-200">
          {copied ? d.common.copied : d.delivery.copyAll}
        </button>
        <a href={`/api/orders/${orderCode}/download`} className="btn-ghost border border-zinc-200">
          {d.delivery.download}
        </a>
        <a href={`/api/orders/${orderCode}/download?format=csv`} className="btn-ghost border border-zinc-200">
          {d.delivery.downloadCsv}
        </a>
      </div>
    </div>
  );
}
