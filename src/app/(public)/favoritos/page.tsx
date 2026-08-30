import type { Metadata } from "next";
import { CategoryCarousel } from "@/components/catalog/CategoryCarousel";
import { buildExploreCategoriesItems } from "@/lib/catalog/explore-categories";
import { getVisibleCategoriesPublic } from "@/lib/db/categories";
import { getActiveSellersForModal } from "@/lib/db/sellers";
import { FavoritesPageClient } from "./FavoritesPageClient";

// noindex: página pessoal (o conteúdo depende do localStorage de cada
// cliente) — não há nada de único para o Google indexar aqui.
export const metadata: Metadata = {
  title: "Minha Seleção",
  robots: { index: false, follow: true },
};

// Sem isso, a página (sem segmento dinâmico) é estaticamente otimizada no
// build — a lista de vendedoras ficaria congelada no deploy, sem refletir
// ativar/desativar vendedora feito depois no admin.
export const dynamic = "force-dynamic";

export default async function FavoritosPage() {
  const [sellers, categories] = await Promise.all([getActiveSellersForModal(), getVisibleCategoriesPublic()]);
  const exploreCategories = buildExploreCategoriesItems(categories);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl text-text sm:text-3xl">Minha Seleção</h1>
      <p className="mt-1 mb-6 text-sm text-text-muted">
        Confira as peças que você escolheu, selecione os tamanhos e envie tudo para uma vendedora.
      </p>

      <FavoritesPageClient sellers={sellers} />

      <section className="mt-12 min-w-0">
        <h2 className="mb-1 font-display text-lg text-text sm:text-xl">Explore por categoria</h2>
        <p className="mb-4 text-sm text-text-muted">Encontre o que combina com você</p>
        <CategoryCarousel items={exploreCategories} />
      </section>
    </main>
  );
}
