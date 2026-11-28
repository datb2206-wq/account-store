import type { Metadata } from 'next';
import { getI18n } from '@/i18n/server';
import { getApiKey } from '@/lib/api-keys';
import { requireUser } from '@/lib/auth';
import { getSiteUrl } from '@/lib/site';
import { getShopBotSettings } from '@/lib/telegram-bot';
import { ApiKeyBox } from './api-key-box';

const TEXT = {
  en: {
    title: 'API documentation',
    intro: 'Buy accounts automatically from your own system or bot. Every request uses your balance, the same prices and stock as the website.',
    keyTitle: 'Your API Key',
    keyNote: 'Send it in the header X-API-Key. Keep it secret: anyone with this key can buy with your balance. If it leaks, generate a new one.',
    show: 'Show', hide: 'Hide', copy: 'Copy', copied: 'Copied!', regen: 'Generate new key',
    regenConfirm: 'Generate a new API key? The current key stops working immediately.', regenDone: 'New key created. Update it in your systems and in the Telegram bot.',
    tgTitle: 'Telegram bot', tgText: 'Open the bot and paste your API Key there to connect this account to your Telegram.', tgOpen: 'Open bot',
    endpoints: 'Endpoints', method: 'Method', path: 'Path', desc: 'Description',
    eMe: 'Account and balance (USD)', eCats: 'Categories', eProducts: 'Products (?category=, ?q=, ?in_stock=1)', eProduct: 'Product detail', eBuy: 'Buy (body: product_id, quantity, coupon)', eOrders: 'Your orders (?page=, ?limit=)', eOrder: 'Order status + delivered accounts',
    examples: 'Examples', notes: 'Notes',
    n1: 'Prices and balance are in USD. Add ?lang=pt or ?lang=en to get names in that language.',
    n2: 'Send an Idempotency-Key header (8–100 chars) when buying: if you retry with the same key you get the same order and are not charged twice.',
    n3: 'Orders from supplier stock may return status PENDING: call GET /api/v1/orders/<code> again after a few seconds until it is COMPLETED (or REFUNDED — money back to your balance).',
    n4: 'Limit: 120 requests per minute. Responses: { "success": true, "data": … } or { "success": false, "error": "…" }.',
  },
  pt: {
    title: 'Documentação da API',
    intro: 'Compre contas automaticamente pelo seu próprio sistema ou bot. Cada pedido usa seu saldo, com os mesmos preços e estoque do site.',
    keyTitle: 'Sua API Key',
    keyNote: 'Envie no cabeçalho X-API-Key. Mantenha em segredo: quem tiver esta chave pode comprar com seu saldo. Se vazar, gere uma nova.',
    show: 'Mostrar', hide: 'Ocultar', copy: 'Copiar', copied: 'Copiado!', regen: 'Gerar nova chave',
    regenConfirm: 'Gerar uma nova API Key? A chave atual para de funcionar imediatamente.', regenDone: 'Nova chave criada. Atualize nos seus sistemas e no bot do Telegram.',
    tgTitle: 'Bot do Telegram', tgText: 'Abra o bot e cole sua API Key lá para conectar esta conta ao seu Telegram.', tgOpen: 'Abrir bot',
    endpoints: 'Endpoints', method: 'Método', path: 'Caminho', desc: 'Descrição',
    eMe: 'Conta e saldo (USD)', eCats: 'Categorias', eProducts: 'Produtos (?category=, ?q=, ?in_stock=1)', eProduct: 'Detalhes do produto', eBuy: 'Comprar (body: product_id, quantity, coupon)', eOrders: 'Seus pedidos (?page=, ?limit=)', eOrder: 'Status do pedido + contas entregues',
    examples: 'Exemplos', notes: 'Observações',
    n1: 'Preços e saldo em USD. Adicione ?lang=pt ou ?lang=en para receber os nomes nesse idioma.',
    n2: 'Envie o cabeçalho Idempotency-Key (8–100 caracteres) ao comprar: repetindo com a mesma chave você recebe o mesmo pedido e não é cobrado duas vezes.',
    n3: 'Pedidos de estoque do fornecedor podem voltar com status PENDING: chame GET /api/v1/orders/<código> de novo após alguns segundos até ficar COMPLETED (ou REFUNDED — valor devolvido ao saldo).',
    n4: 'Limite: 120 requisições por minuto. Respostas: { "success": true, "data": … } ou { "success": false, "error": "…" }.',
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: (locale === 'pt' ? TEXT.pt : TEXT.en).title };
}

export default async function ApiDocsPage() {
  const user = await requireUser();
  const [{ locale }, key, siteUrl, bot] = await Promise.all([getI18n(), getApiKey(user.id, true), getSiteUrl(), getShopBotSettings()]);
  const t = locale === 'pt' ? TEXT.pt : TEXT.en;
  const base = `${siteUrl.replace(/\/+$/, '')}/api/v1`;
  const rows: [string, string, string][] = [
    ['GET', '/me', t.eMe],
    ['GET', '/categories', t.eCats],
    ['GET', '/products', t.eProducts],
    ['GET', '/products/{id}', t.eProduct],
    ['POST', '/orders', t.eBuy],
    ['GET', '/orders', t.eOrders],
    ['GET', '/orders/{code}', t.eOrder],
  ];
  const examples = `# ${t.eMe}
curl ${base}/me -H "X-API-Key: YOUR_API_KEY"

# ${t.eProducts}
curl "${base}/products?in_stock=1&lang=${locale}" -H "X-API-Key: YOUR_API_KEY"

# ${t.eBuy}
curl -X POST ${base}/orders \\
  -H "X-API-Key: YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -H "Idempotency-Key: my-order-0001" \\
  -d '{"product_id":"PRODUCT_ID","quantity":1}'

# ${t.eOrder}
curl ${base}/orders/ORD-XXXX -H "X-API-Key: YOUR_API_KEY"`;
  const response = `{
  "success": true,
  "data": {
    "order": { "code": "ORD-20261128-8F3K2", "status": "COMPLETED", "quantity": 1, "totalAmount": "1.120000", ... },
    "items": ["login|password|2fa|email|..."],
    "balance": "18.880000",
    "replayed": false
  }
}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">🔑 {t.title}</h1>
        <p className="mt-1 text-sm text-zinc-600">{t.intro}</p>
      </div>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">{t.keyTitle}</h2>
        {key && <ApiKeyBox initialKey={key} t={t} />}
        <p className="text-sm text-zinc-600">{t.keyNote}</p>
      </section>

      {bot.enabled && bot.botUsername && (
        <section className="card flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">✈️ {t.tgTitle}</h2>
            <p className="text-sm text-zinc-600">{t.tgText}</p>
          </div>
          <a href={`https://t.me/${bot.botUsername}`} target="_blank" rel="noreferrer" className="btn-primary">{t.tgOpen} →</a>
        </section>
      )}

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">{t.endpoints}</h2>
        <p className="font-mono text-sm break-all text-zinc-700" translate="no">Base URL: {base}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500 uppercase">
                <th className="py-2 pr-3">{t.method}</th>
                <th className="py-2 pr-3">{t.path}</th>
                <th className="py-2">{t.desc}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([m, p, desc]) => (
                <tr key={m + p} className="border-b border-zinc-100">
                  <td className="py-2 pr-3"><span className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${m === 'POST' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>{m}</span></td>
                  <td className="py-2 pr-3 font-mono whitespace-nowrap" translate="no">/api/v1{p}</td>
                  <td className="py-2 text-zinc-700">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-lg font-bold">{t.examples}</h2>
        <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs leading-relaxed text-zinc-100" translate="no">{examples}</pre>
        <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs leading-relaxed text-emerald-300" translate="no">{response}</pre>
      </section>

      <section className="card space-y-2">
        <h2 className="text-lg font-bold">{t.notes}</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-zinc-700">
          <li>{t.n1}</li>
          <li>{t.n2}</li>
          <li>{t.n3}</li>
          <li>{t.n4}</li>
        </ul>
      </section>
    </div>
  );
}
