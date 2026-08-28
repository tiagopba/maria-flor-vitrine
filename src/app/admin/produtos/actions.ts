"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/permissions";
import {
  addProductImages,
  createProduct,
  deleteProductImage,
  getProductByIdAdmin,
  moveProductImage,
  setProductStatus,
  updateProduct,
} from "@/lib/db/products";
import { productSchema, productSizesSchema } from "@/lib/validation/product";

export interface ProductFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function parseProductFormData(formData: FormData) {
  const parsed = productSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: formData.get("description"),
    price: formData.get("price"),
    promotional_price: formData.get("promotional_price"),
    category_id: formData.get("category_id"),
    status: formData.get("status"),
    featured: formData.get("featured") === "on",
  });

  const sizesRaw = formData.getAll("sizes").map(String);
  const sizesParsed = productSizesSchema.safeParse(sizesRaw);

  return { parsed, sizes: sizesParsed.success ? sizesParsed.data : [] };
}

function collectImagePaths(formData: FormData): string[] {
  return formData
    .getAll("image_paths")
    .map(String)
    .filter(Boolean);
}

function fieldErrorsFrom(parsed: { success: false; error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } } }) {
  return Object.fromEntries(
    Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, v?.[0] ?? ""])
  );
}

/** Traduz violação de unique constraint (code/slug) em erro de campo legível. */
function duplicateKeyFieldError(message: string): ProductFormState | null {
  if (message.includes("products_code_key")) {
    return { fieldErrors: { code: "Já existe um produto com esse código." } };
  }
  if (message.includes("products_slug_key")) {
    return { fieldErrors: { slug: "Já existe um produto com esse slug." } };
  }
  return null;
}

export async function createProductAction(
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  await requireAdmin(["admin", "catalog_editor"]);

  const { parsed, sizes } = parseProductFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed) };
  }

  const imagePaths = collectImagePaths(formData);

  let productId: string;
  try {
    const product = await createProduct(parsed.data, sizes, imagePaths);
    productId = product.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível publicar o produto.";
    return duplicateKeyFieldError(message) ?? { error: message };
  }

  revalidatePath("/admin/produtos");
  revalidatePath("/novidades");
  redirect(`/admin/produtos/${productId}`);
}

export async function updateProductAction(
  id: string,
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  await requireAdmin(["admin", "catalog_editor"]);

  const existing = await getProductByIdAdmin(id);
  if (!existing) return { error: "Produto não encontrado." };

  const { parsed, sizes } = parseProductFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed) };
  }

  try {
    await updateProduct(id, parsed.data, sizes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível salvar o produto.";
    return duplicateKeyFieldError(message) ?? { error: message };
  }

  revalidatePath("/admin/produtos");
  revalidatePath("/novidades");
  revalidatePath(`/produto/${existing.slug}`);
  if (existing.slug !== parsed.data.slug) revalidatePath(`/produto/${parsed.data.slug}`);
  revalidatePath(`/categoria`);
  redirect(`/admin/produtos/${id}`);
}

export async function toggleArchiveProductAction(id: string, archive: boolean) {
  await requireAdmin(["admin", "catalog_editor"]);

  const existing = await getProductByIdAdmin(id);
  if (!existing) return;

  await setProductStatus(id, archive ? "ARCHIVED" : "ACTIVE");

  revalidatePath("/admin/produtos");
  revalidatePath("/novidades");
  revalidatePath(`/produto/${existing.slug}`);
}

/**
 * Chamada diretamente do client (não via <form action>) depois que o
 * navegador já subiu os arquivos direto pro Storage — só recebe os paths
 * resultantes, nunca os bytes da imagem.
 */
export async function addProductImagesAction(productId: string, imagePaths: string[]) {
  await requireAdmin(["admin", "catalog_editor"]);

  if (imagePaths.length === 0) return;

  await addProductImages(productId, imagePaths);
  revalidatePath(`/admin/produtos/${productId}`);
}

export async function deleteProductImageAction(productId: string, imageId: string) {
  await requireAdmin(["admin", "catalog_editor"]);
  await deleteProductImage(imageId);
  revalidatePath(`/admin/produtos/${productId}`);
}

export async function moveProductImageAction(
  productId: string,
  imageId: string,
  direction: "up" | "down"
) {
  await requireAdmin(["admin", "catalog_editor"]);
  await moveProductImage(productId, imageId, direction);
  revalidatePath(`/admin/produtos/${productId}`);
}
