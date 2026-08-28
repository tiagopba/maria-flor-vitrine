import "server-only";
import { createClient } from "@/lib/supabase/server";
import { uploadImage, validateImageFile } from "@/lib/images/provider";
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

function extensionFor(file: File): string {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function insertProductImages(productId: string, files: File[], startPosition: number) {
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const validationError = validateImageFile(file);
    if (validationError) throw new Error(validationError);

    const path = `${productId}/${crypto.randomUUID()}.${extensionFor(file)}`;
    const { path: storedPath } = await uploadImage({ bucket: PRODUCTS_BUCKET, path, file });

    const supabase = await createClient();
    const { error } = await supabase
      .from("product_images")
      .insert({ product_id: productId, storage_path: storedPath, position: startPosition + i });

    if (error) throw new Error(error.message);
  }
}

export async function createProduct(
  input: ProductInput,
  sizes: string[],
  imageFiles: File[]
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

  if (imageFiles.length > 0) {
    await insertProductImages(product.id, imageFiles, 0);
  }

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

export async function addProductImages(productId: string, imageFiles: File[]): Promise<void> {
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("product_images")
    .select("position")
    .eq("product_id", productId)
    .order("position", { ascending: false })
    .limit(1);

  const startPosition = (existing?.[0]?.position ?? -1) + 1;
  await insertProductImages(productId, imageFiles, startPosition);
}

export async function deleteProductImage(imageId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("product_images").delete().eq("id", imageId);
  if (error) throw new Error(error.message);
  // O arquivo no Storage fica órfão intencionalmente (sem custo relevante no MVP);
  // limpeza pode virar uma rotina futura se necessário.
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
