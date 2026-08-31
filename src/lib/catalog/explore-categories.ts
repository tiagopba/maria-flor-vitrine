import type { Category } from "@/lib/db/categories";
import { resolveCategoryIconKey, type CategoryIconKey } from "./category-icons";

export interface ExploreCategoryItem {
  key: string;
  name: string;
  href: string;
  icon: CategoryIconKey;
}

/**
 * Monta os itens do carrossel "Explorar categorias" — Novidades sempre
 * primeiro (acesso mais amplo, peças recentes de qualquer categoria; não é
 * uma Category de catálogo de verdade, então entra à mão, sempre com
 * Sparkles) seguido das categorias ativas com produto, cada uma com a
 * chave de ícone que o admin escolheu (icon_key) — ver
 * lib/catalog/category-icons.ts pra a resolução de ícone em si; nenhuma
 * lógica de ícone mora aqui. Compartilhado entre todas as páginas
 * públicas que exibem o carrossel, pra não duplicar essa montagem.
 */
export function buildExploreCategoriesItems(categories: Category[]): ExploreCategoryItem[] {
  return [
    { key: "novidades", name: "Novidades", href: "/novidades", icon: "sparkles" },
    ...categories.map((category) => ({
      key: category.id,
      name: category.name,
      href: `/categoria/${category.slug}`,
      icon: resolveCategoryIconKey(category.icon_key),
    })),
  ];
}
