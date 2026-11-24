import type { Metadata } from 'next';
import { BlogContent } from '@/components/blog-content';
import { getI18n } from '@/i18n/server';

// Trang hướng dẫn chung cho khách Brazil: lấy mã 2FA / đọc mail, đăng nhập an toàn, chính sách bảo hành.
// Chỉ liệt kê các web đọc mail thật sự xuất hiện trong mô tả sản phẩm.
const BODY = {
  pt: {
    title: 'Tutorial e Garantia',
    body: `Leia este guia rápido antes de usar suas contas. Ele responde às dúvidas mais comuns de quem compra pela primeira vez.

## 1. Como pegar o código 2FA

- O código 2FA é a sequência de letras e números que vem junto com a conta (ex.: ABCD EFGH IJKL ...).
- Abra https://2fa.live, cole a chave 2FA e clique em Enviar: o site mostra o código de 6 dígitos para o login.
- O código muda a cada 30 segundos. Se der erro, gere um novo e tente de novo.

## 2. Como ler o e-mail da conta (código de verificação)

- Cada produto informa na descrição qual serviço de e-mail usar.
- Tempmail.Plus: abra https://tempmail.plus e digite o endereço de e-mail que veio com a conta.
- Fviainboxes / Smvmail / FV / SMV: são caixas de e-mail do fornecedor. Use o endereço e a senha de e-mail que vieram no formato da conta.
- Hotmail / Outlook: entre em https://outlook.live.com com o e-mail e a senha de e-mail da conta.
- Outros sites (5smail, f-mailbox, lazyios...): o link e a senha ficam na descrição do próprio produto.

## 3. Como fazer login sem checkpoint

- Use sempre um proxy limpo (de preferência do mesmo país da conta) e um navegador antidetect (GPM, AdsPower, Dolphin...).
- Uma conta por perfil do navegador. Não abra várias contas no mesmo IP.
- Se a conta vier com cookie, importe o cookie no navegador antidetect em vez de digitar a senha.
- Depois de entrar, troque a senha e vincule seu próprio e-mail para proteger a conta.

## 4. Garantia de reposição

- A garantia cobre erro no 1º login: senha errada, cookie inválido ou conta bloqueada no momento da entrega.
- O prazo de garantia de cada produto está na descrição (ex.: 45 minutos após a compra). Teste logo depois de comprar.
- Para pedir reposição, envie o código do pedido e as contas com problema para o Suporte ao Cliente.
- Não cobrimos bloqueios causados pelo uso (anúncios, spam, troca de IP/dispositivo sem proxy...).
- Dica profissional: teste de 1 a 3 unidades antes de comprar em grande volume.`,
  },
  en: {
    title: 'Tutorial & Warranty',
    body: `A quick guide to using your accounts.

## 1. Getting the 2FA code

- Open https://2fa.live, paste the 2FA key that came with the account and click Submit to get the 6-digit code.

## 2. Reading the account e-mail

- Each product says in its description which mail service to use (Tempmail.Plus, Fviainboxes / Smvmail, Hotmail...).

## 3. Logging in safely

- Use a clean proxy and an antidetect browser, one account per profile. Change the password and add your own e-mail after logging in.

## 4. Replacement warranty

- The warranty covers 1st-login errors (wrong password, invalid cookie, account locked at delivery) within the period shown on each product. Send the order code to support.`,
  },
};

const content = (locale: string) => (locale === 'pt' ? BODY.pt : BODY.en);

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: content(locale).title, alternates: { canonical: '/pages/guia' } };
}

export default async function GuidePage() {
  const { locale } = await getI18n();
  const c = content(locale);
  return (
    <article className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm sm:p-10">
      <h1 className="mb-6 text-2xl font-bold text-zinc-900 sm:text-3xl">{c.title}</h1>
      <BlogContent text={c.body} />
    </article>
  );
}
