import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { listProductsAdmin } from "@/lib/db/products";
import { sortProductSizes } from "@/lib/catalog/size-order";
import type { SaveProductSizeFitPayload } from "@/lib/validation/product-size-fit";
import type { Database } from "@/types/database";

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

    // Só ordem de apresentação (PP→P→M→G→GG→XG→XGG→G1→G2→G3, depois
    // numéricos crescentes, "Único"/texto livre sempre por último) —
    // reaproveita o mesmo helper já usado no catálogo público, nunca
    // reordena nem reescreve o que está em product_sizes.
    const orderIndex = new Map(sortProductSizes(labelFits.map((l) => l.labelSize)).map((size, i) => [size, i]));
    const labels: SizeFitReviewLabel[] = labelFits
      .map((l) => ({ ...l, pending: l.fitSizes.length === 0 }))
      .sort((a, b) => (orderIndex.get(a.labelSize) ?? 0) - (orderIndex.get(b.labelSize) ?? 0));
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

/**
 * Contagem leve pro badge do menu ("Revisar numerações (6)") — roda em
 * TODA página do Admin (layout.tsx), então busca só o estritamente
 * necessário pra contar: nunca nome, foto, preço, categoria, cor ou
 * descrição (isso é responsabilidade só da própria tela Revisar
 * numerações, que continua usando listSizeFitReviewProducts pra montar
 * os cards completos — layout e página nunca compartilham esse objeto
 * grande, cada um busca só o que precisa).
 *
 * 3 consultas pequenas, em paralelo — nenhuma depende do resultado das
 * outras. `product_sizes` e `product_size_fit_compatibilities` vêm
 * inteiras (sem filtrar por produto): as duas tabelas são pequenas no
 * catálogo real, e buscar tudo de uma vez evita depender do resultado da
 * consulta de `products` antes de disparar as outras duas. Produto
 * arquivado é descartado depois, em memória, cruzando com o Set de ids
 * ativos. Mesma regra de sempre: produto pendente = pelo menos um
 * label_size atual sem nenhuma linha de compatibilidade correspondente.
 */
export async function countPendingSizeFitProductsLight(): Promise<number> {
  const supabase = await createClient();

  const [
    { data: products, error: productsError },
    { data: sizes, error: sizesError },
    { data: fits, error: fitsError },
  ] = await Promise.all([
    supabase.from("products").select("id").neq("status", "ARCHIVED"),
    supabase.from("product_sizes").select("product_id, size"),
    supabase.from("product_size_fit_compatibilities").select("product_id, label_size"),
  ]);

  if (productsError) throw new Error(productsError.message);
  if (sizesError) throw new Error(sizesError.message);
  if (fitsError) throw new Error(fitsError.message);

  const activeProductIds = new Set((products ?? []).map((p) => p.id));
  const compatKeys = new Set((fits ?? []).map((f) => `${f.product_id}::${f.label_size}`));

  const pendingIds = new Set<string>();
  for (const row of sizes ?? []) {
    if (!activeProductIds.has(row.product_id) || pendingIds.has(row.product_id)) continue;
    if (!compatKeys.has(`${row.product_id}::${row.size}`)) pendingIds.add(row.product_id);
  }

  return pendingIds.size;
}

/**
 * Mesma leitura em lote de getSizeFitCompatibilityByProductIds (acima),
 * mas parametrizada pelo client — usada pela vitrine pública (página de
 * produto, Minhas Roupas, mensagem de WhatsApp), NUNCA pelo client de
 * sessão/cookie (ver o motivo documentado em lib/supabase/public.ts: uma
 * sessão de admin inválida no mesmo navegador não pode derrubar uma
 * leitura pública). Implementação deliberadamente duplicada em vez de
 * fatorada em cima de getSizeFitCompatibilityByProductIds — a tela Admin
 * Revisar numerações não deve ser tocada por esta mudança, nem
 * indiretamente por um refactor compartilhado.
 */
async function getSizeFitCompatibilityByProductIdsForClient(
  supabase: SupabaseClient<Database>,
  productIds: string[]
): Promise<Map<string, LabelSizeFit[]>> {
  if (productIds.length === 0) return new Map();

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

/**
 * Variante pública (anon key, sem cookies) de getSizeFitCompatibilityByProductIds
 * — usada pela página de produto e por qualquer leitura server-side que
 * roda numa página pública (RSC). A RLS pública de product_size_fit_compatibilities
 * já restringe a produtos publicados/não arquivados e a label_size que
 * ainda existe em product_sizes, então não repete essa checagem aqui.
 */
export async function getSizeFitCompatibilityByProductIdsPublic(
  productIds: string[]
): Promise<Map<string, LabelSizeFit[]>> {
  return getSizeFitCompatibilityByProductIdsForClient(createPublicClient(), productIds);
}

/**
 * Mesma leitura, mas recebendo um client já criado pelo chamador — usada
 * por Server Actions que já têm seu próprio client em escopo (ex:
 * favorites-click-action.ts, que usa o client admin) e não devem criar um
 * segundo client só para esta consulta.
 */
export async function getSizeFitCompatibilityWithClient(
  supabase: SupabaseClient<Database>,
  productIds: string[]
): Promise<Map<string, LabelSizeFit[]>> {
  return getSizeFitCompatibilityByProductIdsForClient(supabase, productIds);
}
