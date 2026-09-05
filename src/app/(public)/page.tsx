import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { CategoryCarousel } from "@/components/catalog/CategoryCarousel";
import { GroupedProductGrid } from "@/components/catalog/GroupedProductGrid";
import { HomeSearch } from "@/components/catalog/HomeSearch";
import { buildExploreCategoriesItems } from "@/lib/catalog/explore-categories";
import { groupProductsForDisplay, type DisplayGroup } from "@/lib/catalog/group-products-for-display";
import { getVisibleCategoriesPublic } from "@/lib/db/categories";
import { listPublishedProducts } from "@/lib/db/products";
import { getPaymentSettings } from "@/lib/site-settings/payments";

// `absolute` de propósito — o layout raiz aplica um template "%s | Maria
// Flor" a todo título; aqui a marca já vem primeiro no texto pedido, então
// o template duplicaria "Maria Flor".
const HOME_TITLE = "Maria Flor | Moda Feminina em Paranaíba MS";
const HOME_DESCRIPTION =
  "Loja de moda feminina em Paranaíba MS. Roupas femininas, jeans, vestidos, blusas, conjuntos, acessórios e novidades todos os dias. Conheça a Maria Flor.";

export const metadata: Metadata = {
  title: { absolute: HOME_TITLE },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  // Sem `images` de propósito — herda o `opengraph-image.png` já existente
  // na raiz do app (convenção de arquivo do Next.js), a mesma imagem
  // institucional usada como fallback em qualquer página sem foto própria.
  openGraph: {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
  },
};

// Sem isso, a Home (sem segmento dinâmico nem searchParams) é
// estaticamente otimizada no build — "Acabaram de chegar" e "Explore por
// categoria" ficariam congelados no HTML daquele deploy, sem refletir um
// produto ou categoria novos cadastrados depois no admin (só apareceriam
// no próximo deploy). Todas as outras páginas públicas já são dinâmicas
// (searchParams força isso automaticamente nas que têm filtro; as
// institucionais têm esse mesmo `force-dynamic` explícito) — só a Home
// tinha ficado de fora.
export const dynamic = "force-dynamic";

const HOME_NOVIDADES_TARGET = 16;

/**
 * `listPublishedProducts(N)` traz N REGISTROS (uma linha por cor), não N
 * cards — várias cores do mesmo modelo colapsam num card só depois do
 * agrupamento (ver group-products-for-display.ts). Por isso não dá pra só
 * pedir `HOME_NOVIDADES_TARGET` registros e exibir: se os lançamentos mais
 * recentes tiverem várias cores, esses registros podem virar bem menos
 * cards do que o alvo depois do agrupamento.
 *
 * Busca em lotes crescentes (24 → 48 → 96) até ter `HOME_NOVIDADES_TARGET`
 * grupos distintos ou esgotar o catálogo publicado, sempre reconsultando
 * do topo (mesma ordenação por published_at desc) — o lote pequeno cobre
 * o caso comum (poucas cores por modelo) com uma única consulta; só
 * escala quando necessário, sem carregar o catálogo inteiro na Home.
 */
async function getHomeNovidadesGroups(): Promise<DisplayGroup[]> {
  const batchSizes = [24, 48, 96];
  let groups: DisplayGroup[] = [];

  for (const batchSize of batchSizes) {
    const products = await listPublishedProducts(batchSize);
    groups = groupProductsForDisplay(products);

    // Menos registros do que o lote pedido = catálogo publicado acabou,
    // não adianta pedir um lote maior.
    if (groups.length >= HOME_NOVIDADES_TARGET || products.length < batchSize) break;
  }

  return groups.slice(0, HOME_NOVIDADES_TARGET);
}

export default async function Home() {
  const [novidadesGroups, categorias, paymentSettings] = await Promise.all([
    getHomeNovidadesGroups(),
    getVisibleCategoriesPublic(),
    getPaymentSettings(),
  ]);

  const exploreCategories = buildExploreCategoriesItems(categorias);

  return (
    <main className="flex flex-1 flex-col">
      {/* Hero — H1 real é "Moda Feminina em Paranaíba MS" (item 1 do SEO
          local), mas visualmente quase idêntico ao anterior: só ganha uma
          linha pequena em cima da mesma frase de sempre, sem texto
          escondido nem mudança de estilo do hero. Padding vertical
          reduzido de propósito (era py-10/py-14) — a primeira tela do
          celular deve chegar mais rápido em busca/categorias/produtos. */}
      <section className="px-4 py-6 text-center sm:py-8">
        <h1 className="mx-auto max-w-sm font-display text-text">
          <span className="block text-xs font-semibold uppercase tracking-wide text-primary sm:text-sm">
            Moda Feminina em Paranaíba MS
          </span>
          <span className="mt-2 block text-2xl leading-snug sm:text-4xl">
            Tudo o que você viu nos nossos Stories, agora em um só lugar.
          </span>
        </h1>
      </section>

      {/* Busca */}
      <section className="border-y border-border bg-muted/50 px-4 py-6 sm:px-6 sm:py-8">
        <h2 className="mb-4 text-center font-display text-lg text-text sm:text-xl">
          Viu no Instagram? Encontre aqui.
        </h2>
        <HomeSearch />
      </section>

      {/* Explore por categoria */}
      <section className="px-4 py-6 sm:px-6 sm:py-8">
        <h2 className="mb-1 font-display text-lg text-text sm:text-xl">Explore por categoria</h2>
        <p className="mb-4 text-sm text-text-muted">Encontre o que combina com você</p>
        <CategoryCarousel items={exploreCategories} variant="grid" />
      </section>

      {/* Acabaram de chegar */}
      <section className="px-4 py-6 sm:px-6 sm:py-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg text-text sm:text-xl">Acabaram de chegar</h2>
          <Link href="/novidades" className="text-sm font-medium text-primary">
            Ver todas
          </Link>
        </div>

        {novidadesGroups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
            As novidades da Maria Flor aparecem aqui assim que forem publicadas.
          </div>
        ) : (
          <GroupedProductGrid groups={novidadesGroups} paymentSettings={paymentSettings} />
        )}
      </section>

      {/* Chamadas institucionais — discretas, sem popup nem virar página de banners */}
      <section className="grid gap-4 px-4 py-8 sm:grid-cols-2 sm:px-6">
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-border p-5">
          <h2 className="font-display text-base text-text">Quer receber nossas ofertas?</h2>
          <p className="text-sm text-text-muted">
            Entre para nosso grupo e acompanhe promoções e novidades.
          </p>
          <Link href="/ofertas" className="mt-1">
            <Button variant="secondary" className="h-11">
              Quero entrar
            </Button>
          </Link>
        </div>

        <div className="flex flex-col items-start gap-2 rounded-2xl border border-border p-5">
          <h2 className="font-display text-base text-text">Prefere visitar a loja?</h2>
          <p className="text-sm text-text-muted">Venha nos conhecer pessoalmente em Paranaíba/MS.</p>
          <Link href="/como-chegar" className="mt-1">
            <Button variant="secondary" className="h-11">
              Como chegar
            </Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
