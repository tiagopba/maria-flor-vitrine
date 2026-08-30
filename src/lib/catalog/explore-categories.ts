import type { Category } from "@/lib/db/categories";
import type { CategoryCarouselItem, CategoryIconKey } from "@/components/catalog/CategoryCarousel";

/**
 * Ícone por categoria a partir do nome (case-insensitive). Cobre os casos
 * com identidade própria (Look Eliara, Acessórios); o resto do catálogo é
 * peça de roupa em geral e usa o ícone de camisa — o lucide-react não tem
 * ícone específico de calça/vestido/saia/short, então "shirt" é o melhor
 * substituto disponível para essas categorias, em vez de inventar um SVG
 * próprio só para isso.
 */
function iconForCategory(name: string): CategoryIconKey {
  const normalized = name.toLowerCase();
  if (normalized.includes("look")) return "star";
  if (normalized.includes("acess")) return "shopping-bag";
  return "shirt";
}

/**
 * Monta os itens do carrossel "Explorar categorias" — Novidades sempre
 * primeiro (acesso mais amplo, peças recentes de qualquer categoria; não é
 * uma Category de catálogo de verdade, então entra à mão) seguido das
 * categorias ativas com produto. Compartilhado entre todas as páginas
 * públicas que exibem o carrossel, pra não duplicar essa montagem.
 */
export function buildExploreCategoriesItems(categories: Category[]): CategoryCarouselItem[] {
  return [
    { key: "novidades", name: "Novidades", href: "/novidades", icon: "sparkles" },
    ...categories.map((category) => ({
      key: category.id,
      name: category.name,
      href: `/categoria/${category.slug}`,
      icon: iconForCategory(category.name),
    })),
  ];
}
