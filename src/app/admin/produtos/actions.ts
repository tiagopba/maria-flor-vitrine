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
  searchProductsForRelate,
  setProductStatus,
  updateProduct,
  type ProductSearchResult,
} from "@/lib/db/products";
import { createColor, type Color } from "@/lib/db/colors";
import {
  ensureProductGroup,
  findDuplicateColorInGroup,
  relateProductToGroup,
  type DuplicateColorWarning,
} from "@/lib/db/product-groups";
import { isManualProductSlugAvailable, resolveAutoProductSlug } from "@/lib/db/product-slug";
import { colorSchema } from "@/lib/validation/color";
import { productSchema, productSizesSchema } from "@/lib/validation/product";

export interface ProductFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * Um campo opcional desabilitado (exclusão mútua Pix/promocional, ou
 * "usar parcelamento padrão") não entra no FormData e formData.get()
 * devolve `null` — mas z.string().optional() só aceita `undefined`, nunca
 * `null`, e falha com uma mensagem técnica do Zod ("Invalid input:
 * expected string, received null"). Normaliza null e string vazia pra
 * undefined aqui, antes do Zod ver o valor, pros dois significarem a
 * mesma coisa: "não informado".
 */
function optionalFormValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const str = String(value).trim();
  return str === "" ? undefined : str;
}

function parseProductFormData(formData: FormData) {
  const parsed = productSchema.safeParse({
    code: formData.get("code"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    description: optionalFormValue(formData, "description"),
    price: formData.get("price"),
    promotional_price: optionalFormValue(formData, "promotional_price"),
    cash_price: optionalFormValue(formData, "cash_price"),
    max_installments_override: optionalFormValue(formData, "max_installments_override"),
    category_id: formData.get("category_id"),
    status: formData.get("status"),
    featured: formData.get("featured") === "on",
    color_id: optionalFormValue(formData, "color_id"),
    product_group_id: optionalFormValue(formData, "product_group_id"),
  });

  const sizesRaw = formData.getAll("sizes").map(String);
  const sizesParsed = productSizesSchema.safeParse(sizesRaw);

  // "auto" = slug ainda vem do preview automático (nome+código+cor), o
  // servidor recalcula e resolve colisão sozinho; "manual" = a admin
  // editou o campo com a própria mão, então o valor digitado é respeitado
  // (só verificado quanto a disponibilidade, nunca sobrescrito em
  // silêncio). color_name só serve pra montar o slug automático — nunca é
  // persistido (o banco só guarda color_id).
  const slugSource: "auto" | "manual" = formData.get("slug_source") === "manual" ? "manual" : "auto";
  const colorName = optionalFormValue(formData, "color_name") ?? null;

  return { parsed, sizes: sizesParsed.success ? sizesParsed.data : [], slugSource, colorName };
}

/**
 * Resolve o slug final antes de qualquer escrita: no modo automático,
 * recalcula nome+código+cor no servidor e resolve colisão (-2, -3...)
 * sozinho — o valor que veio do form é só a prévia visual, nunca a fonte
 * da verdade. No modo manual, respeita o que a admin digitou, só
 * verificando disponibilidade (nunca troca em silêncio o que ela decidiu
 * escrever). Devolve `{ slug }` em caso de sucesso, ou `{ fieldError }`
 * pronto pra devolver como ProductFormState.
 */
async function resolveFinalSlug(params: {
  slugSource: "auto" | "manual";
  submittedSlug: string;
  name: string;
  code: string;
  colorName: string | null;
  excludeProductId?: string;
}): Promise<{ slug: string } | { fieldError: string }> {
  if (params.slugSource === "manual") {
    const available = await isManualProductSlugAvailable(params.submittedSlug, params.excludeProductId);
    if (!available) {
      return { fieldError: "Esse endereço já está em uso — tente outro." };
    }
    return { slug: params.submittedSlug };
  }

  const slug = await resolveAutoProductSlug({
    name: params.name,
    code: params.code,
    colorName: params.colorName,
    excludeProductId: params.excludeProductId,
  });
  return { slug };
}

function collectImagePaths(formData: FormData): string[] {
  return formData
    .getAll("image_paths")
    .map(String)
    .filter(Boolean);
}

/**
 * Última rede de segurança: se algum caminho ainda deixar passar uma
 * mensagem padrão do Zod (ex: "Invalid input: expected string, received
 * null") em vez da mensagem customizada do schema, troca por um texto
 * genérico — a admin nunca deve ver jargão de validação técnica.
 */
function friendlyFieldMessage(message: string): string {
  return /^invalid /i.test(message) ? "Valor inválido." : message;
}

function fieldErrorsFrom(parsed: { success: false; error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } } }) {
  return Object.fromEntries(
    Object.entries(parsed.error.flatten().fieldErrors).map(([k, v]) => [k, friendlyFieldMessage(v?.[0] ?? "")])
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

  const { parsed, sizes, slugSource, colorName } = parseProductFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed) };
  }

  const slugResult = await resolveFinalSlug({
    slugSource,
    submittedSlug: parsed.data.slug,
    name: parsed.data.name,
    code: parsed.data.code,
    colorName,
  });
  if ("fieldError" in slugResult) {
    return { fieldErrors: { slug: slugResult.fieldError } };
  }

  const imagePaths = collectImagePaths(formData);

  let productId: string;
  try {
    const product = await createProduct({ ...parsed.data, slug: slugResult.slug }, sizes, imagePaths);
    productId = product.id;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível publicar o produto.";
    return duplicateKeyFieldError(message) ?? { error: message };
  }

  revalidatePath("/admin/produtos");
  revalidatePath("/novidades");
  redirect(`/admin/produtos/${productId}?sucesso=${encodeURIComponent("Produto cadastrado com sucesso.")}`);
}

export async function updateProductAction(
  id: string,
  _prevState: ProductFormState,
  formData: FormData
): Promise<ProductFormState> {
  await requireAdmin(["admin", "catalog_editor"]);

  const existing = await getProductByIdAdmin(id);
  if (!existing) return { error: "Produto não encontrado." };

  const { parsed, sizes, slugSource, colorName } = parseProductFormData(formData);
  if (!parsed.success) {
    return { fieldErrors: fieldErrorsFrom(parsed) };
  }

  const slugResult = await resolveFinalSlug({
    slugSource,
    submittedSlug: parsed.data.slug,
    name: parsed.data.name,
    code: parsed.data.code,
    colorName,
    excludeProductId: id,
  });
  if ("fieldError" in slugResult) {
    return { fieldErrors: { slug: slugResult.fieldError } };
  }
  const finalData = { ...parsed.data, slug: slugResult.slug };

  try {
    await updateProduct(id, finalData, sizes, existing.slug);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível salvar o produto.";
    return duplicateKeyFieldError(message) ?? { error: message };
  }

  revalidatePath("/admin/produtos");
  revalidatePath("/novidades");
  revalidatePath(`/produto/${existing.slug}`);
  if (existing.slug !== finalData.slug) revalidatePath(`/produto/${finalData.slug}`);
  revalidatePath(`/categoria`);
  redirect(`/admin/produtos/${id}?sucesso=${encodeURIComponent("Alterações salvas com sucesso.")}`);
}

/**
 * Cria uma cor nova sem sair do formulário de produto — usada pelo drawer
 * "+ Nova cor". Reaproveita colorSchema/createColor (mesma validação e
 * gravação de qualquer outro fluxo de cor), só devolve a cor criada em
 * vez de redirecionar, já que quem chama é um modal dentro de outra
 * página.
 */
export async function createColorQuickAction(
  name: string,
  hexColor: string | null
): Promise<{ color: Color } | { error: string }> {
  await requireAdmin(["admin", "catalog_editor"]);

  const parsed = colorSchema.safeParse({ name, hex_color: hexColor ?? undefined });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const color = await createColor(parsed.data);
    return { color };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível criar a cor.";
    return { error: message.includes("colors_slug_key") ? "Já existe uma cor com esse nome." : message };
  }
}

/**
 * Garante que o produto atual tem um product_group_id (criando um grupo
 * novo se ainda não tiver) — chamado antes de navegar pro cadastro de
 * "nova peça em outra cor", pra o novo produto já nascer vinculado ao
 * mesmo conjunto.
 */
export async function ensureProductGroupAction(productId: string): Promise<{ groupId: string } | { error: string }> {
  await requireAdmin(["admin", "catalog_editor"]);
  try {
    const groupId = await ensureProductGroup(productId);
    revalidatePath(`/admin/produtos/${productId}`);
    return { groupId };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível preparar o vínculo de cores." };
  }
}

/** Busca por nome/código pro modal "relacionar peça já cadastrada". */
export async function searchProductsForRelateAction(
  query: string,
  excludeProductId: string
): Promise<ProductSearchResult[]> {
  await requireAdmin(["admin", "catalog_editor"]);
  return searchProductsForRelate(query, excludeProductId);
}

/**
 * Relaciona uma peça já cadastrada como "outra cor do mesmo modelo" do
 * produto atual. Idempotente se já estiver no mesmo grupo; erro amigável
 * (nunca técnico) se já pertencer a outro grupo.
 */
export async function relateProductToGroupAction(
  currentProductId: string,
  targetProductId: string
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin(["admin", "catalog_editor"]);

  try {
    await relateProductToGroup(currentProductId, targetProductId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível relacionar as peças." };
  }

  revalidatePath(`/admin/produtos/${currentProductId}`);
  revalidatePath(`/admin/produtos/${targetProductId}`);
  return { ok: true };
}

/**
 * Aviso não-bloqueante: existe outra peça do mesmo grupo já com essa
 * cor? A admin decide se é intencional e continua — nunca bloqueia o
 * salvamento (ver decisão do item 7, sem constraint de banco pra isso).
 */
export async function checkDuplicateColorInGroupAction(
  groupId: string,
  colorId: string,
  excludeProductId?: string
): Promise<DuplicateColorWarning | null> {
  await requireAdmin(["admin", "catalog_editor"]);
  return findDuplicateColorInGroup(groupId, colorId, excludeProductId);
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
