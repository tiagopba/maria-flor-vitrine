import type { ProductListItem } from "@/lib/db/products";

export interface DisplayGroupSwatch {
  id: string;
  name: string;
  hex: string | null;
}

export interface DisplayGroup {
  /** Variante usada como card/link — sempre a primeira do grupo na ordem já retornada pela consulta. */
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
 * A ordem de entrada já reflete a ordenação real da consulta (mais
 * recente primeiro etc.) — a primeira variante de cada grupo encontrada
 * vira a representante do card, como pedido (regra determinística simples,
 * sem coluna nova de "cor principal"). Uma variante arquivada/despublicada
 * nunca aparece aqui porque já não está na lista de entrada.
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
    }

    if (item.color_id && !group.swatches.some((s) => s.id === item.color_id)) {
      group.swatches.push({ id: item.color_id, name: item.colorName ?? "Cor", hex: item.colorHex });
    }
  });

  return result;
}
