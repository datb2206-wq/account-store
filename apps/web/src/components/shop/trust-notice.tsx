import type { Locale } from '@/i18n/config';

// Khung thông báo nổi bật đầu trang chủ (nội dung do chủ shop cung cấp). Chỉ hiện ở trang tổng.
const CONTENT = {
  pt: {
    title: 'FORNECEDOR OFICIAL DE CONTINGÊNCIA | REFERÊNCIA NO MERCADO DESDE 2021',
    intro: 'Mais de 1.000.000 contas entregues com sistema 100% automático 24/7, checagem prévia e estoque próprio verificado.',
    items: [
      ['Qualidade Premium', 'Perfis selecionados, aquecidos e prontos para tráfego pago e escala.'],
      ['Exclusividade Total (Zero Revenda)', 'A conta é removida do sistema imediatamente após a compra.'],
      ['Checagem Live Automática', 'Todos os ativos passam por verificação antes da entrega.'],
      ['Recarga Instantânea', 'Saldo liberado na hora via PIX (24/7) e USDT/Crypto.'],
      ['Garantia Real & Suporte Rápido', 'Reposição garantida em caso de erro no 1º login, com atendimento direto no Telegram.'],
    ],
    support: 'Tempo médio de suporte: < 15 min',
    tipLabel: 'Dica profissional',
    tip: 'Recomendamos testar de 1 a 3 unidades com proxy e antidetect limpos antes de comprar em grande volume.',
  },
  en: {
    title: 'OFFICIAL CONTINGENCY SUPPLIER | MARKET REFERENCE SINCE 2021',
    intro: 'Over 1,000,000 accounts delivered with a 100% automatic 24/7 system, pre-checked and verified in-house stock.',
    items: [
      ['Premium quality', 'Selected, warmed-up profiles ready for paid traffic and scaling.'],
      ['Total exclusivity (zero resale)', 'The account is removed from the system right after purchase.'],
      ['Automatic live check', 'Every asset is verified before delivery.'],
      ['Instant top-up', 'Balance credited instantly via PIX (24/7) and USDT/Crypto.'],
      ['Real warranty & fast support', 'Guaranteed replacement if the 1st login fails, with direct support on Telegram.'],
    ],
    support: 'Average support time: < 15 min',
    tipLabel: 'Pro tip',
    tip: 'We recommend testing 1 to 3 units with a clean proxy and antidetect browser before buying in bulk.',
  },
};

export function TrustNotice({ locale }: { locale: Locale }) {
  const c = locale === 'pt' ? CONTENT.pt : CONTENT.en;
  return (
    <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-orange-200">
      <div className="flex items-start gap-3 bg-gradient-to-r from-orange-600 to-amber-500 px-5 py-4 text-white">
        <svg viewBox="0 0 24 24" className="mt-0.5 size-7 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3Z" strokeLinejoin="round" />
          <path d="m8.5 12 2.5 2.5 4.5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <div>
          <h2 className="text-base leading-snug font-extrabold tracking-wide sm:text-lg">{c.title}</h2>
          <p className="mt-1 text-sm text-white/90">{c.intro}</p>
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-semibold">
            <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" strokeLinecap="round" /></svg>
            {c.support}
          </p>
        </div>
      </div>
      <ul className="grid gap-x-6 gap-y-3 px-5 py-4 sm:grid-cols-2">
        {c.items.map(([title, text]) => (
          <li key={title} className="flex gap-2.5 text-sm leading-relaxed text-zinc-700">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-500 text-white" aria-hidden>
              <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3"><path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </span>
            <span>
              <b className="text-zinc-900">{title}:</b> {text}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex gap-2.5 border-t border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-900">
        <span aria-hidden>💡</span>
        <p>
          <b>{c.tipLabel}:</b> {c.tip}
        </p>
      </div>
    </section>
  );
}
