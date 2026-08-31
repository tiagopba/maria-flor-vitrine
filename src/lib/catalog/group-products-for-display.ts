import type { ProductListItem } from "@/lib/db/products";

export interface DisplayGroupSwatch {
  id: string;
  name: string;
  hex: string | null;
}

export interface DisplayGroup {
  /** Variante usada como card/link — ver regra de escolha abaixo. */
  representative: ProductListItem;
  /** Cores de todas as variantes públicas do grupo (incluindo a representante), sem repetir. */
  swatches: DisplayGroupSwatch[];
}

/**
 * Agrupa uma lista já pública (status != ARCHIVED, published_at
 * preenchido) por `product_group_id`, para as vitrines mostrarem UM card
 * por modelo em vez de um card por cor — nunca junta registros no banco,
 * isso é só apresentação (ver migration save_product_with_variants: cada
 * cor continua uma linha independente em `products`).
 *
 * Escolha da representante: se alguma variante do grupo tem `featured =
 * true`, ela é sempre a representante (é exatamente pra isso que existe o
 * destaque por cor — decidir qual cor aparece primeiro nas vitrines). Só
 * uma variante deveria estar destacada por grupo (o formulário admin já
 * desmarca as outras ao marcar uma nova — ver ProductForm), mas se alguma
 * inconsistência histórica deixar mais de uma, a primeira destacada
 * encontrada na ordem de entrada vence, de forma determinística. Sem
 * nenhuma destacada, cai no fallback determinístico atual: a primeira
 * variante do grupo na ordem já retornada pela consulta (mais recente
 * primeiro etc.), sem precisar de nenhuma coluna nova de "cor principal".
 * Uma variante arquivada/despublicada nunca aparece aqui porque já não
 * está na lista de entrada.
 *
 * `keepStandalone` força um item a nunca se juntar a nenhum grupo nem
 * receber outros itens dentro do seu — usado pela busca por código
 * (item 8 da especificação): um resultado que bateu por código precisa
 * continuar visível como o resultado exato, nunca escondido atrás de outra
 * cor do mesmo modelo escolhida como representante.
 */
export function groupProductsForDisplay(
  items: ProductListItem[],
  options?: { keepStandalone?: (item: ProductListItem) => boolean }
): DisplayGroup[] {
  const groups = new Map<string, DisplayGroup>();
  const result: DisplayGroup[] = [];

  items.forEach((item, index) => {
    const forceStandalone = options?.keepStandalone?.(item) ?? false;
    const key = forceStandalone ? `standalone:${item.id}:${index}` : (item.product_group_id ?? `single:${item.id}`);

    let group = groups.get(key);
    if (!group) {
      group = { representative: item, swatches: [] };
      groups.set(key, group);
      result.push(group);
    } else if (item.featured && !group.representative.featured) {
      group.representative = item;
    }

    if (item.color_id && !group.swatches.some((s) => s.id === item.color_id)) {
      group.swatches.push({ id: item.color_id, name: item.colorName ?? "Cor", hex: item.colorHex });
    }
  });

  return result;
}
