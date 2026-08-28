/**
 * Fonte única da URL pública do site — usada em metadata (canonical, Open
 * Graph), na URL enviada na mensagem do WhatsApp e em qualquer outro lugar
 * que precise montar um link absoluto.
 *
 * Prioridade:
 * 1. NEXT_PUBLIC_SITE_URL — setar isso assim que o domínio próprio
 *    (ex: vitrine.modamariaflor.com.br) estiver configurado. É o único
 *    lugar que precisa mudar quando isso acontecer.
 * 2. Preview Deploy da Vercel — usa a URL do próprio deployment, para que
 *    um link de preview aponte pra ele mesmo (não para produção).
 * 3. Produção na Vercel sem domínio próprio ainda — URL estável do projeto
 *    (ex: maria-flor-vitrine.vercel.app), sem hardcode espalhado pelo código.
 * 4. Dev local.
 */
export function getSiteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;

  if (process.env.VERCEL_ENV !== "production" && process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  return "http://localhost:3000";
}
