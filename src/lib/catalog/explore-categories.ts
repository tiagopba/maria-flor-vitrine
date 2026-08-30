import type { Category } from "@/lib/db/categories";
import type { CategoryCarouselItem } from "@/components/catalog/CategoryCarousel";

/**
 * Monta os itens do carrossel "Explorar categorias" — Novidades sempre
 * primeiro (acesso mais amplo, peças recentes de qualquer categoria; não é
 * uma Category de catálogo de verdade, então entra à mão) seguido das
 * categorias ativas com produto. Compartilhado entre a Home e a página de
 * produto pra não duplicar essa montagem.
 */
export function buildExploreCategoriesItems(categories: Category[]): CategoryCarouselItem[] {
  return [
    { key: "novidades", name: "Novidades", href: "/novidades" },
    ...categories.map((category) => ({
      key: category.id,
      name: category.name,
      href: `/categoria/${category.slug}`,
    })),
  ];
}
