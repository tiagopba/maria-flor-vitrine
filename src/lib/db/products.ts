import "server-only";
import { createClient } from "@/lib/supabase/server";
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
  images: (ProductImage & { url: string })[];
  sizes: string[];
}

const PRODUCTS_BUCKET = "products";

async function attachCategoryAndMainImage(
  products: Product[]
): Promise<ProductListItem[]> {
  if (products.length === 0) return [];

  const supabase = await createClient();
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

  return attachCategoryAndMainImage(data ?? []);
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
    .select("name")
    .eq("id", product.category_id)
    .maybeSingle();

  return {
    ...product,
    categoryName: category?.name ?? null,
    images: (images ?? []).map((img) => ({ ...img, url: publicImageUrl(PRODUCTS_BUCKET, img.storage_path) })),
    sizes: (sizes ?? []).map((s) => s.size),
  };
}

export async function getProductBySlugPublic(slug: string): Promise<ProductDetail | null> {
  const supabase = await createClient();

  // Filtro explícito além do RLS (que já bloqueia ARCHIVED/não publicado):
  // deixa a regra visível aqui e evita depender só da policy do banco.
  const { data: product, error } = await supabase
    .from("products")
    .select("*")
    .eq("slug", slug)
    .neq("status", "ARCHIVED")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!product) return null;

  const [{ data: images }, { data: sizes }, { data: category }] = await Promise.all([
    supabase.from("product_images").select("*").eq("product_id", product.id).order("position"),
    supabase.from("product_sizes").select("*").eq("product_id", product.id).order("position"),
    supabase.from("categories").select("name").eq("id", product.category_id).maybeSingle(),
  ]);

  return {
    ...product,
    categoryName: category?.name ?? null,
    images: (images ?? []).map((img) => ({ ...img, url: publicImageUrl(PRODUCTS_BUCKET, img.storage_path) })),
    sizes: (sizes ?? []).map((s) => s.size),
  };
}

export async function listPublishedProducts(limit = 24): Promise<ProductListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .neq("status", "ARCHIVED")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);

  return attachCategoryAndMainImage(data ?? []);
}

export async function listPublishedProductsByCategory(categoryId: string): Promise<ProductListItem[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("category_id", categoryId)
    .neq("status", "ARCHIVED")
    .not("published_at", "is", null)
    .lte("published_at", new Date().toISOString())
    .order("published_at", { ascending: false });

  if (error) throw new Error(error.message);

  return attachCategoryAndMainImage(data ?? []);
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
