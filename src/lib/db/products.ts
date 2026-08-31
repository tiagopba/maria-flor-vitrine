import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { deleteImage } from "@/lib/images/provider";
import { publicImageUrl } from "@/lib/images/url";
import type { ProductInput } from "@/lib/validation/product";
import type { Database } from "@/types/database";

export type Product = Database["public"]["Tables"]["products"]["Row"];
export type ProductImage = Database["public"]["Tables"]["product_images"]["Row"];
export type ProductSize = Database["public"]["Tables"]["product_sizes"]["Row"];

export interface ProductListItem extends Product {
  categoryName: string | null;
  mainImageUrl: string | null;
}

export interface ProductDetail extends Product {
  categoryName: string | null;
  categorySlug: string | null;
  images: (ProductImage & { url: string })[];
  sizes: string[];
}

const PRODUCTS_BUCKET = "products";

async function attachCategoryAndMainImage(
  supabase: SupabaseClient<Database>,
  products: Product[]
): Promise<ProductListItem[]> {
  if (products.length === 0) return [];

  const categoryIds = [...new Set(products.map((p) => p.category_id))];
  const productIds = products.map((p) => p.id);

  const [{ data: categories }, { data: images }] = await Promise.all([
    supabase.from("categories").select("id, name").in("id", categoryIds),
    supabase
      .from("product_images")
      .select("product_id, storage_path, position")
      .in("product_id", productIds)
      .eq("position", 0),
  ]);

  const categoryNameById = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const mainImageByProduct = new Map(
    (images ?? []).map((img) => [img.product_id, publicImageUrl(PRODUCTS_BUCKET, img.storage_path)])
  );

  return products.map((product) => ({
    ...product,
    categoryName: categoryNameById.get(product.category_id) ?? null,
    mainImageUrl: mainImageByProduct.get(product.id) ?? null,
  }));
}

export interface ListProductsAdminFilters {
  search?: string;
  categoryId?: string;
  status?: Product["status"] | "ALL";
}

export async function listProductsAdmin(
  filters: ListProductsAdminFilters = {}
): Promise<ProductListItem[]> {
  const supabase = await createClient();
  const { status } = filters;

  let query = supabase.from("products").select("*").order("created_at", { ascending: false });

  if (status && status !== "ALL") {
    query = query.eq("status", status);
  } else if (!status) {
    query = query.neq("status", "ARCHIVED");
  }

  if (filters.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }

  if (filters.search) {
    const term = filters.search.trim();
    query = query.or(`code.ilike.%${term}%,name.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return attachCategoryAndMainImage(supabase, data ?? []);
}

export async function getProductByIdAdmin(id: string): Promise<ProductDetail | null> {
  const supabase = await createClient();

  const [{ data: product, error }, { data: images }, { data: sizes }, ] = await Promise.all([
    supabase.from("products").select("*").eq("id", id).maybeSingle(),
    supabase.from("product_images").select("*").eq("product_id", id).order("position"),
    supabase.from("product_sizes").select("*").eq("product_id", id).order("position"),
  ]);

  if (error) throw new Error(error.message);
  if (!product) return null;

  const { data: category } = await supabase
    .from("categories")
    .select("name, slug")
    .eq("id", product.category_id)
    .maybeSingle();

  return {
    ...product,
    categoryName: category?.name ?? null,
    categorySlug: category?.slug ?? null,
    images: (images ?? []).map((img) => ({ ...img, url: publicImageUrl(PRODUCTS_BUCKET, img.storage_path) })),
    sizes: (sizes ?? []).map((s) => s.size),
  };
}

export async function getProductBySlugPublic(slug: string): Promise<ProductDetail | null> {
  const supabase = createPublicClient();

  // status/published_at IS NOT NULL são filtrados aqui também (não só via
  // RLS) para deixar a regra visível no código. A comparação "published_at
  // <= agora" propositalmente NÃO é repetida aqui — isso é deixado só para
  // a RLS (policy "products_public_read"), porque o Postgres usa o relógio
  // do próprio banco. Se essa checagem fosse feita na aplicação com
  // `new Date()`, um relógio de servidor dessincronizado esconderia
  // produtos recém-publicados (foi exatamente isso que aconteceu e foi
  // corrigido aqui).
  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .neq("status", "ARCHIVED")
    .not("published_at", "is", null)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!product) return null;

  const [{ data: images }, { data: sizes }, { data: category }] = await Promise.all([
    supabase.from("product_images").select("*").eq("product_id", product.id).order("position"),
    supabase.from("product_sizes").select("*").eq("product_id", product.id).order("position"),
    supabase.from("categories").select("name, slug").eq("id", product.category_id).maybeSingle(),
  ]);

  return {
    ...product,
    categoryName: category?.name ?? null,
    categorySlug: category?.slug ?? null,
    images: (images ?? []).map((img) => ({ ...img, url: publicImageUrl(PRODUCTS_BUCKET, img.storage_path) })),
    sizes: (sizes ?? []).map((s) => s.size),
  };
}

/**
 * "Você também pode gostar" — mesma categoria, mais recentes primeiro,
 * excluindo o próprio produto. Uma consulta só (reaproveita
 * attachCategoryAndMainImage, sem N+1). Sem motor de recomendação: se a
 * categoria tiver menos que `limit` peças publicadas, mostra só o que
 * existe — não completa com outras categorias.
 */
export async function getRelatedProductsPublic(productId: string, categoryId: string, limit = 8): Promise<ProductListItem[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("category_id", categoryId)
    .neq("id", productId)
    .neq("status", "ARCHIVED")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return attachCategoryAndMainImage(supabase, data ?? []);
}

export async function listPublishedProducts(limit = 24): Promise<ProductListItem[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .neq("status", "ARCHIVED")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return attachCategoryAndMainImage(supabase, data ?? []);
}

export async function listPublishedProductsByCategory(categoryId: string): Promise<ProductListItem[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("category_id", categoryId)
    .neq("status", "ARCHIVED")
    .not("published_at", "is", null)
    .order("published_at", { ascending: false });

  if (error) throw new Error(error.message);

  return attachCategoryAndMainImage(supabase, data ?? []);
}

/**
 * Busca pública por código, nome ou descrição — sempre restrita a produtos
 * publicados e não arquivados (mesma regra de visibilidade das outras
 * listagens).
 */
export async function searchPublishedProducts(query: string, limit = 24): Promise<ProductListItem[]> {
  const term = query.trim();
  if (!term) return [];

  const supabase = createPublicClient();
  const escaped = term.replace(/[%_]/g, "\\$&");

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .neq("status", "ARCHIVED")
    .not("published_at", "is", null)
    .or(`code.ilike.%${escaped}%,name.ilike.%${escaped}%,description.ilike.%${escaped}%`)
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return attachCategoryAndMainImage(supabase, data ?? []);
}

export type PublicProductStatusFilter = "available" | "last_units";

export interface PublicProductFilters {
  categoryId?: string;
  size?: string;
  minPrice?: number;
  maxPrice?: number;
  /**
   * "available" = ACTIVE + CHECK_AVAILABILITY (giro normal, sem alarde).
   * "last_units" = só LAST_UNITS. SOLD_OUT nunca aparece em nenhum dos
   * dois — quem quiser ver esgotados usa a listagem sem filtro de status.
   */
  status?: PublicProductStatusFilter;
  q?: string;
}

/**
 * Listagem pública com filtros combináveis (preço, tamanho, categoria,
 * status, busca por texto) — usada por /busca, /novidades e
 * /categoria/[slug]. Mesmas regras de visibilidade das outras listagens
 * públicas (status != ARCHIVED, published_at preenchido, o resto fica
 * para a RLS). O filtro de tamanho é uma segunda consulta (product_sizes
 * é tabela separada, não coluna) — nunca uma consulta por produto.
 *
 * Filtro de preço: quando `cashPriceEnabled` é true, compara contra
 * `cash_price` quando o produto tiver (modelo novo), com fallback pro
 * preço efetivo legado (`promotional_price ?? price`) pros que não têm —
 * mesma regra de "Preço no Pix" usada em lib/catalog/pricing.ts. Quando
 * `cashPriceEnabled` é false (Pix desativado na loja), a coluna
 * `cash_price` nem é referenciada — comportamento idêntico ao que já
 * existia antes do modelo de dois preços.
 */
export async function listPublishedProductsFiltered(
  filters: PublicProductFilters = {},
  limit?: number,
  cashPriceEnabled = false
): Promise<ProductListItem[]> {
  const supabase = createPublicClient();

  let query = supabase.from("products").select("*").neq("status", "ARCHIVED").not("published_at", "is", null);

  if (filters.categoryId) {
    query = query.eq("category_id", filters.categoryId);
  }

  if (filters.status === "last_units") {
    query = query.eq("status", "LAST_UNITS");
  } else if (filters.status === "available") {
    query = query.in("status", ["ACTIVE", "CHECK_AVAILABILITY"]);
  }

  if (filters.minPrice != null || filters.maxPrice != null) {
    const min = filters.minPrice ?? 0;
    const max = filters.maxPrice ?? 999999;
    const legacyOr = `and(promotional_price.gte.${min},promotional_price.lte.${max}),and(promotional_price.is.null,price.gte.${min},price.lte.${max})`;
    const dualOr = `and(cash_price.gte.${min},cash_price.lte.${max}),and(cash_price.is.null,promotional_price.gte.${min},promotional_price.lte.${max}),and(cash_price.is.null,promotional_price.is.null,price.gte.${min},price.lte.${max})`;
    query = query.or(cashPriceEnabled ? dualOr : legacyOr);
  }

  if (filters.q) {
    const term = filters.q.trim();
    const escaped = term.replace(/[%_]/g, "\\$&");
    query = query.or(`code.ilike.%${escaped}%,name.ilike.%${escaped}%,description.ilike.%${escaped}%`);
  }

  if (filters.size) {
    const { data: sizeRows, error: sizeError } = await supabase
      .from("product_sizes")
      .select("product_id")
      .eq("size", filters.size);
    if (sizeError) throw new Error(sizeError.message);

    const ids = [...new Set((sizeRows ?? []).map((r) => r.product_id))];
    if (ids.length === 0) return [];
    query = query.in("id", ids);
  }

  query = query.order("published_at", { ascending: false });
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return attachCategoryAndMainImage(supabase, data ?? []);
}

/**
 * Tamanhos distintos entre produtos públicos, para o filtro de tamanho só
 * oferecer valores que existem de verdade no catálogo (nunca uma lista
 * fixa). Uma única consulta em product_sizes, sem juntar products aqui —
 * a policy de RLS "product_sizes_public_read" já restringe as linhas
 * devolvidas às de produtos publicados/não arquivados, então o filtro de
 * visibilidade não precisa ser repetido em código.
 */
export async function getAvailableSizesPublic(): Promise<string[]> {
  const supabase = createPublicClient();
  const { data, error } = await supabase.from("product_sizes").select("size");
  if (error) throw new Error(error.message);

  return [...new Set((data ?? []).map((row) => row.size))].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { numeric: true })
  );
}

/**
 * Busca vários produtos de uma vez pelos IDs salvos localmente em
 * Favoritos — sempre em lote (produtos + imagens + tamanhos + categorias
 * em só 4 consultas, nunca uma por produto) para não virar N+1 conforme a
 * lista de favoritos cresce.
 *
 * Usa o client público (RLS `products_public_read`), então um id
 * arquivado/despublicado simplesmente não volta no resultado — é assim que
 * a página de Favoritos detecta "esse favorito não é mais válido" sem
 * precisar duplicar a regra de visibilidade aqui.
 */
export async function getProductsByIdsPublic(ids: string[]): Promise<ProductDetail[]> {
  if (ids.length === 0) return [];

  const supabase = createPublicClient();

  const { data: products, error } = await supabase.from("products").select("*").in("id", ids);
  if (error) throw new Error(error.message);
  if (!products || products.length === 0) return [];

  const validIds = products.map((p) => p.id);
  const categoryIds = [...new Set(products.map((p) => p.category_id))];

  const [{ data: images }, { data: sizes }, { data: categories }] = await Promise.all([
    supabase.from("product_images").select("*").in("product_id", validIds).order("position"),
    supabase.from("product_sizes").select("*").in("product_id", validIds).order("position"),
    supabase.from("categories").select("id, name, slug").in("id", categoryIds),
  ]);

  const categoryNameById = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const categorySlugById = new Map((categories ?? []).map((c) => [c.id, c.slug]));

  const imagesByProduct = new Map<string, ProductImage[]>();
  for (const img of images ?? []) {
    const list = imagesByProduct.get(img.product_id) ?? [];
    list.push(img);
    imagesByProduct.set(img.product_id, list);
  }

  const sizesByProduct = new Map<string, string[]>();
  for (const s of sizes ?? []) {
    const list = sizesByProduct.get(s.product_id) ?? [];
    list.push(s.size);
    sizesByProduct.set(s.product_id, list);
  }

  return products.map((product) => ({
    ...product,
    categoryName: categoryNameById.get(product.category_id) ?? null,
    categorySlug: categorySlugById.get(product.category_id) ?? null,
    images: (imagesByProduct.get(product.id) ?? []).map((img) => ({
      ...img,
      url: publicImageUrl(PRODUCTS_BUCKET, img.storage_path),
    })),
    sizes: sizesByProduct.get(product.id) ?? [],
  }));
}

/**
 * Grava as linhas de product_images a partir de paths já enviados ao
 * Storage (upload acontece direto do navegador — ver
 * lib/images/upload-client.ts — nunca passa pelo corpo de uma Server
 * Action/Route Handler, por causa do limite de 4.5MB da Vercel).
 */
async function insertProductImageRows(productId: string, storagePaths: string[], startPosition: number) {
  if (storagePaths.length === 0) return;

  const supabase = await createClient();
  const { error } = await supabase.from("product_images").insert(
    storagePaths.map((storage_path, i) => ({
      product_id: productId,
      storage_path,
      position: startPosition + i,
    }))
  );

  if (error) throw new Error(error.message);
}

export async function createProduct(
  input: ProductInput,
  sizes: string[],
  imagePaths: string[]
): Promise<Product> {
  const supabase = await createClient();

  const { data: product, error } = await supabase
    .from("products")
    .insert({ ...input, published_at: new Date().toISOString() })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  if (sizes.length > 0) {
    const { error: sizesError } = await supabase
      .from("product_sizes")
      .insert(sizes.map((size, position) => ({ product_id: product.id, size, position })));
    if (sizesError) throw new Error(sizesError.message);
  }

  await insertProductImageRows(product.id, imagePaths, 0);

  return product;
}

export async function updateProduct(id: string, input: ProductInput, sizes: string[]): Promise<Product> {
  const supabase = await createClient();

  const { data: product, error } = await supabase
    .from("products")
    .update(input)
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  const { error: deleteError } = await supabase.from("product_sizes").delete().eq("product_id", id);
  if (deleteError) throw new Error(deleteError.message);

  if (sizes.length > 0) {
    const { error: sizesError } = await supabase
      .from("product_sizes")
      .insert(sizes.map((size, position) => ({ product_id: id, size, position })));
    if (sizesError) throw new Error(sizesError.message);
  }

  return product;
}

export async function addProductImages(productId: string, imagePaths: string[]): Promise<void> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("product_images")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(1);

  const startPosition = (existing?.[0]?.position ?? -1) + 1;
  await insertProductImageRows(productId, imagePaths, startPosition);
}

/**
 * Remove a imagem: apaga o arquivo do Storage e depois o registro em
 * `product_images`. Se o arquivo já não existir mais no Storage (ou a
 * remoção falhar por qualquer outro motivo), a falha é registrada mas não
 * bloqueia a limpeza do registro — o banco é sempre a fonte de verdade de
 * quais fotos o produto tem; não deixamos um registro "preso" só porque o
 * arquivo já sumiu. Isso evita órfãos novos sem precisar de um job de
 * garbage collection separado.
 */
export async function deleteProductImage(imageId: string): Promise<void> {
  const supabase = await createClient();

  const { data: image, error: fetchError } = await supabase
    .from("product_images")
    .select("storage_path, product_id")
    .eq("id", imageId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);

  if (image) {
    try {
      await deleteImage(PRODUCTS_BUCKET, image.storage_path);
    } catch (err) {
      console.error(`[deleteProductImage] falha ao remover do Storage (${image.storage_path}):`, err);
    }
  }

  const { error } = await supabase.from("product_images").delete().eq("id", imageId);
  if (error) throw new Error(error.message);

  // Sem isso, remover a foto que estava na posição 0 (ex: depois de
  // reordenar) deixa nenhuma imagem nessa posição — e a "imagem principal"
  // das listagens é sempre buscada por position=0, então o produto passaria
  // a aparecer como "sem foto" mesmo tendo fotos.
  if (image) {
    await renumberProductImages(image.product_id);
  }
}

async function renumberProductImages(productId: string): Promise<void> {
  const supabase = await createClient();

  const { data: remaining, error } = await supabase
    .from("product_images")
    .select("id, position")
    .eq("product_id", productId)
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);

  for (let i = 0; i < (remaining?.length ?? 0); i++) {
    if (remaining![i].position !== i) {
      const { error: updateError } = await supabase
        .from("product_images")
        .update({ position: i })
        .eq("id", remaining![i].id);
      if (updateError) throw new Error(updateError.message);
    }
  }
}

export async function moveProductImage(productId: string, imageId: string, direction: "up" | "down"): Promise<void> {
  const supabase = await createClient();

  const { data: all, error } = await supabase
    .from("product_images")
    .select("id, position")
    .eq("product_id", productId)
    .order("position", { ascending: true });

  if (error) throw new Error(error.message);
  if (!all) return;

  const index = all.findIndex((img) => img.id === imageId);
  if (index === -1) return;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= all.length) return;

  const current = all[index];
  const target = all[targetIndex];

  const { error: error1 } = await supabase
    .from("product_images")
    .update({ position: target.position })
    .eq("id", current.id);
  if (error1) throw new Error(error1.message);

  const { error: error2 } = await supabase
    .from("product_images")
    .update({ position: current.position })
    .eq("id", target.id);
  if (error2) throw new Error(error2.message);
}

export async function setProductStatus(id: string, status: Product["status"]): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("products")
    .update({ status, archived_at: status === "ARCHIVED" ? new Date().toISOString() : null })
    .eq("id", id);

  if (error) throw new Error(error.message);
}
