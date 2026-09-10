import "server-only";
import { createClient } from "@/lib/supabase/server";
import { listProductsAdmin } from "@/lib/db/products";
import type { SaveProductSizeFitPayload } from "@/lib/validation/product-size-fit";

/**
 * Módulo isolado para "numerações que veste" — deliberadamente separado de
 * lib/db/products.ts (módulo estabilizado). Nunca reinterpreta
 * product_sizes: só lê (pra saber quais label_size existem por produto,
 * e pra validar contra órfãos) e nunca escreve nela.
 */

export interface LabelSizeFit {
  /** Texto exatamente como está em product_sizes.size para este produto. */
  labelSize: string;
  /** Numerações marcadas para este label_size — vazio = pendente. */
  fitSizes: number[];
}

/**
 * Compatibilidade de um produto, por tamanho da etiqueta — só inclui
 * label_size que existe HOJE em product_sizes para este produto (uma
 * compatibilidade órfã, de um tamanho já removido da etiqueta, nunca
 * aparece aqui como se fosse válida; ela é limpa na próxima vez que
 * saveProductSizeFitCompatibilities for chamada para este produto).
 */
export async function getSizeFitCompatibilityByProductId(productId: string): Promise<LabelSizeFit[]> {
  const map = await getSizeFitCompatibilityByProductIds([productId]);
  return map.get(productId) ?? [];
}

/** Mesma ideia, em lote — nunca N+1 (usada pela tela de revisão e por
 * qualquer tela que precise de vários produtos de uma vez). */
export async function getSizeFitCompatibilityByProductIds(
  productIds: string[]
): Promise<Map<string, LabelSizeFit[]>> {
  if (productIds.length === 0) return new Map();

  const supabase = await createClient();

  const [{ data: sizes, error: sizesError }, { data: fits, error: fitsError }] = await Promise.all([
    supabase.from("product_sizes").select("product_id, size").in("product_id", productIds),
    supabase
      .from("product_size_fit_compatibilities")
      .select("product_id, label_size, fit_size")
      .in("product_id", productIds),
  ]);

  if (sizesError) throw new Error(sizesError.message);
  if (fitsError) throw new Error(fitsError.message);

  const fitsByKey = new Map<string, number[]>();
  for (const row of fits ?? []) {
    const key = `${row.product_id}::${row.label_size}`;
    const list = fitsByKey.get(key) ?? [];
    list.push(row.fit_size);
    fitsByKey.set(key, list);
  }

  const result = new Map<string, LabelSizeFit[]>();
  for (const row of sizes ?? []) {
    const key = `${row.product_id}::${row.size}`;
    const list = result.get(row.product_id) ?? [];
    list.push({ labelSize: row.size, fitSizes: (fitsByKey.get(key) ?? []).sort((a, b) => a - b) });
    result.set(row.product_id, list);
  }

  return result;
}

/** Erro controlado vindo da RPC — mesmo padrão de SaveProductWithVariantsError. */
export class SaveProductSizeFitError extends Error {
  code: string;
  constructor(code: string, raw: string) {
    super(raw);
    this.code = code;
  }
}

export interface SaveProductSizeFitResult {
  productIds: string[];
  insertedCount: number;
}

/**
 * Chama save_product_size_fit_compatibilities (RPC dedicada, transação
 * própria — nunca a mesma de save_product_with_variants). Substituição
 * completa por produto: quem chama sempre manda o conjunto COMPLETO que
 * deve valer depois de salvar (inclusive vazio, se a intenção é limpar
 * tudo daquele produto).
 */
export async function saveProductSizeFitCompatibilities(
  payload: SaveProductSizeFitPayload
): Promise<SaveProductSizeFitResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("save_product_size_fit_compatibilities", { payload });

  if (error) {
    throw new SaveProductSizeFitError(error.message.split(":")[0].trim(), error.message);
  }

  return { productIds: data.product_ids ?? [], insertedCount: data.inserted_count ?? 0 };
}

export interface SizeFitReviewLabel extends LabelSizeFit {
  pending: boolean;
}

export interface SizeFitReviewProduct {
  productId: string;
  code: string;
  name: string;
  colorName: string | null;
  mainImageUrl: string | null;
  categoryName: string | null;
  labels: SizeFitReviewLabel[];
  isPending: boolean;
}

export interface SizeFitReviewFilters {
  status?: "pending" | "reviewed";
  search?: string;
  categoryId?: string;
}

/**
 * Lista pra "Produtos → Revisar numerações" — reaproveita listProductsAdmin
 * (mesma busca por código/nome e filtro de categoria de sempre, mesma
 * regra de "não arquivado", fotos/cor/categoria já resolvidas) em vez de
 * duplicar essa lógica aqui. Produto sem tamanho nenhum cadastrado não
 * entra (não há o que revisar); produto vira "pendente" se QUALQUER
 * label_size dele ainda não tiver compatibilidade.
 */
export async function listSizeFitReviewProducts(
  filters: SizeFitReviewFilters = {}
): Promise<SizeFitReviewProduct[]> {
  const products = await listProductsAdmin({ search: filters.search, categoryId: filters.categoryId });
  const compatByProduct = await getSizeFitCompatibilityByProductIds(products.map((p) => p.id));

  const items: SizeFitReviewProduct[] = [];
  for (const p of products) {
    const labelFits = compatByProduct.get(p.id) ?? [];
    if (labelFits.length === 0) continue;

    const labels: SizeFitReviewLabel[] = labelFits.map((l) => ({ ...l, pending: l.fitSizes.length === 0 }));
    const isPending = labels.some((l) => l.pending);

    items.push({
      productId: p.id,
      code: p.code,
      name: p.name,
      colorName: p.colorName,
      mainImageUrl: p.mainImageUrl,
      categoryName: p.categoryName,
      labels,
      isPending,
    });
  }

  if (filters.status === "pending") return items.filter((i) => i.isPending);
  if (filters.status === "reviewed") return items.filter((i) => !i.isPending);
  return items;
}

/** Contagem pro badge do menu ("Revisar numerações (27)") — some quando chega a 0. */
export async function countPendingSizeFitProducts(): Promise<number> {
  const items = await listSizeFitReviewProducts({ status: "pending" });
  return items.length;
}
