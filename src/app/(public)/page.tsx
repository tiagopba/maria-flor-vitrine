import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { CategoryCarousel } from "@/components/catalog/CategoryCarousel";
import { HomeSearch } from "@/components/catalog/HomeSearch";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { buildExploreCategoriesItems } from "@/lib/catalog/explore-categories";
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

export default async function Home() {
  const [novidades, categorias, paymentSettings] = await Promise.all([
    listPublishedProducts(8),
    getVisibleCategoriesPublic(),
    getPaymentSettings(),
  ]);

  const exploreCategories = buildExploreCategoriesItems(categorias);

  return (
    <main className="flex flex-1 flex-col">
      {/* Hero — H1 real é "Moda Feminina em Paranaíba MS" (item 1 do SEO
          local), mas visualmente quase idêntico ao anterior: só ganha uma
          linha pequena em cima da mesma frase de sempre, sem texto
          escondido nem mudança de estilo do hero. */}
      <section className="px-4 py-10 text-center sm:py-14">
        <h1 className="mx-auto max-w-md font-display text-text">
          <span className="block text-xs font-semibold uppercase tracking-wide text-primary sm:text-sm">
            Moda Feminina em Paranaíba MS
          </span>
          <span className="mt-2 block text-xl sm:text-3xl">
            Tudo o que você viu nos nossos Stories, agora em um só lugar.
          </span>
        </h1>
      </section>

      {/* Busca */}
      <section className="border-y border-border bg-muted/50 px-4 py-8 sm:px-6">
        <h2 className="mb-4 text-center font-display text-lg text-text sm:text-xl">
          Viu no Instagram? Encontre aqui.
        </h2>
        <HomeSearch />
      </section>

      {/* Acabaram de chegar */}
      <section className="px-4 py-8 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg text-text sm:text-xl">Acabaram de chegar</h2>
          <Link href="/novidades" className="text-sm font-medium text-primary">
            Ver todas
          </Link>
        </div>

        {novidades.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
            As novidades da Maria Flor aparecem aqui assim que forem publicadas.
          </div>
        ) : (
          <ProductGrid products={novidades} paymentSettings={paymentSettings} />
        )}
      </section>

      {/* Explore por categoria */}
      <section className="px-4 py-8 sm:px-6">
        <h2 className="mb-1 font-display text-lg text-text sm:text-xl">Explore por categoria</h2>
        <p className="mb-4 text-sm text-text-muted">Encontre o que combina com você</p>
        <CategoryCarousel items={exploreCategories} />
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
