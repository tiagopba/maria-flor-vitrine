import {
  Footprints,
  Gem,
  Handbag,
  Layers2,
  PersonStanding,
  Shirt,
  Sparkles,
  Star,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { createElement, type SVGProps } from "react";

/**
 * Assinatura mínima que tanto os ícones do lucide-react quanto os SVGs
 * lineares próprios abaixo satisfazem — é o que o carrossel/seletor do
 * admin realmente usam (className, strokeWidth, aria-hidden). Não é o
 * tipo LucideIcon em si porque os SVGs próprios não são gerados pelo
 * lucide, mas têm exatamente o mesmo traço/estética.
 */
export type CategoryIconComponent = (props: {
  className?: string;
  strokeWidth?: number;
  "aria-hidden"?: SVGProps<SVGSVGElement>["aria-hidden"];
}) => ReturnType<LucideIcon>;

/**
 * O lucide-react não tem ícone literal de calça/saia/vestido/short — os
 * mais próximos disponíveis (colunas, tesoura, triângulo, símbolo de
 * Vênus) não lembram a peça de verdade e ficam estranhos num seletor
 * visual. Em vez de forçar um símbolo que não diz nada, estes são SVGs
 * lineares simples, desenhados à mão, com o mesmo traço/estética do
 * lucide (viewBox 24x24, sem preenchimento, ponta e junção arredondada,
 * strokeWidth configurável) — silhueta reconhecível, não um ícone
 * genérico qualquer.
 */
function createLinearIcon(paths: string[]): CategoryIconComponent {
  return function LinearCategoryIcon({ className, strokeWidth = 2, ...rest }) {
    return createElement(
      "svg",
      {
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        className,
        ...rest,
      },
      paths.map((d, i) => createElement("path", { key: i, d }))
    );
  };
}

const PantsIcon = createLinearIcon(["M7,3 L17,3 L18,21 L14,21 L12,10 L10,21 L6,21 Z"]);
const ShortsIcon = createLinearIcon(["M7,3 L17,3 L17.5,15 L14,15 L12,9 L10,15 L6.5,15 Z"]);
const SkirtIcon = createLinearIcon(["M9,4 L15,4 L19,20 L5,20 Z"]);
const DressIcon = createLinearIcon(["M9,3 Q12,5 15,3 L13,11 L16.5,21 L7.5,21 L11,11 Z"]);

/**
 * Registry central de ícones de categoria — único lugar do código que
 * conhece a lista de ícones disponíveis e o componente de cada um. Toda
 * área que precisa exibir ou escolher um ícone de categoria (carrossel
 * público, seletor do admin) usa este arquivo, pra nunca duplicar a
 * lista em mais de um lugar.
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

export const CATEGORY_ICON_REGISTRY: Record<CategoryIconKey, { label: string; Icon: CategoryIconComponent }> = {
  shirt: { label: "Blusa / Camiseta", Icon: Shirt },
  pants: { label: "Calça", Icon: PantsIcon },
  dress: { label: "Vestido", Icon: DressIcon },
  skirt: { label: "Saia", Icon: SkirtIcon },
  shorts: { label: "Shorts", Icon: ShortsIcon },
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
    normalized.includes("t-shirt") ||
    normalized.includes("tshirt") ||
    normalized.includes("top") ||
    normalized.includes("regata")
  )
    return "shirt";

  return NEUTRAL_FALLBACK;
}
