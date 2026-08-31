import {
  Columns2,
  Footprints,
  Gem,
  Handbag,
  Layers2,
  PersonStanding,
  Scissors,
  Shirt,
  Sparkles,
  Star,
  Tag,
  Triangle,
  Venus,
  type LucideIcon,
} from "lucide-react";

/**
 * Registry central de ícones de categoria — único lugar do código que
 * conhece a lista de ícones disponíveis e o componente lucide-react de
 * cada um. Toda área que precisa exibir ou escolher um ícone de
 * categoria (carrossel público, seletor do admin) usa este arquivo, pra
 * nunca duplicar a lista em mais de um lugar.
 *
 * O lucide-react não tem ícone literal de calça/vestido/saia/short/cabide
 * — os mais próximos disponíveis foram escolhidos por semelhança visual
 * (ex: "pants" usa Columns2, duas barras verticais lembrando pernas de
 * calça). Por isso o admin escolhe visualmente em vez de confiar 100% no
 * nome — ver suggestCategoryIconKey, que é só uma sugestão inicial.
 */
export const CATEGORY_ICON_KEYS = [
  "shirt",
  "pants",
  "dress",
  "skirt",
  "shorts",
  "set",
  "bag",
  "accessories",
  "look",
  "shoes",
  "star",
  "sparkles",
  "tag",
] as const;

export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

export const CATEGORY_ICON_REGISTRY: Record<CategoryIconKey, { label: string; Icon: LucideIcon }> = {
  shirt: { label: "Blusa / Camiseta", Icon: Shirt },
  pants: { label: "Calça", Icon: Columns2 },
  dress: { label: "Vestido", Icon: Venus },
  skirt: { label: "Saia", Icon: Triangle },
  shorts: { label: "Shorts", Icon: Scissors },
  set: { label: "Conjunto", Icon: Layers2 },
  bag: { label: "Bolsa", Icon: Handbag },
  accessories: { label: "Acessórios", Icon: Gem },
  look: { label: "Cabide / Look", Icon: PersonStanding },
  shoes: { label: "Sapato", Icon: Footprints },
  star: { label: "Estrela", Icon: Star },
  sparkles: { label: "Brilho / Novidades", Icon: Sparkles },
  tag: { label: "Neutro", Icon: Tag },
};

/** Ícone neutro e elegante — usado quando a categoria não tem icon_key definido. */
const NEUTRAL_FALLBACK: CategoryIconKey = "tag";

function isCategoryIconKey(value: string | null | undefined): value is CategoryIconKey {
  return !!value && (CATEGORY_ICON_KEYS as readonly string[]).includes(value);
}

/**
 * Chave de ícone válida a exibir em qualquer área pública — lê só o
 * icon_key salvo no banco, nunca adivinha por nome/slug aqui (isso é
 * papel só de suggestCategoryIconKey, usado apenas como sugestão inicial
 * no admin). icon_key vazio ou desconhecido cai no ícone neutro, nunca
 * em "shirt" por padrão — era exatamente esse "camiseta pra tudo" que
 * causava ícone errado em categorias como Calças e Conjuntos.
 *
 * Devolve a CHAVE (string), não o componente — quem monta esse item roda
 * no servidor (ver lib/catalog/explore-categories.ts) e passa como prop
 * pro CategoryCarousel, que é Client Component; uma referência de
 * componente não atravessa essa fronteira serializável do React Server
 * Components, só um valor simples como string. O carrossel resolve a
 * chave pro componente de verdade só na hora de renderizar, usando
 * CATEGORY_ICON_REGISTRY direto (mesmo registry, sem duplicar a lista).
 */
export function resolveCategoryIconKey(iconKey: string | null | undefined): CategoryIconKey {
  return isCategoryIconKey(iconKey) ? iconKey : NEUTRAL_FALLBACK;
}

/**
 * Sugestão automática pro admin ao digitar o nome de uma categoria nova
 * — só isso, nunca usada na exibição pública. Cai no ícone neutro quando
 * nada bate, nunca assume uma peça de roupa específica sem indício no
 * nome.
 */
export function suggestCategoryIconKey(name: string): CategoryIconKey {
  const normalized = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

  if (normalized.includes("novidade")) return "sparkles";
  if (normalized.includes("look") || normalized.includes("provador")) return "look";
  if (normalized.includes("calca") || normalized.includes("legging") || normalized.includes("jean")) return "pants";
  if (normalized.includes("conjunto")) return "set";
  if (normalized.includes("vestido")) return "dress";
  if (normalized.includes("saia")) return "skirt";
  if (normalized.includes("short") || normalized.includes("bermuda")) return "shorts";
  if (normalized.includes("bolsa")) return "bag";
  if (normalized.includes("acess") || normalized.includes("joia") || normalized.includes("bijuteria")) return "accessories";
  if (
    normalized.includes("sapato") ||
    normalized.includes("calcado") ||
    normalized.includes("sandalia") ||
    normalized.includes("tenis")
  )
    return "shoes";
  if (
    normalized.includes("blusa") ||
    normalized.includes("camiseta") ||
    normalized.includes("camisa") ||
    normalized.includes("top") ||
    normalized.includes("regata")
  )
    return "shirt";

  return NEUTRAL_FALLBACK;
}
