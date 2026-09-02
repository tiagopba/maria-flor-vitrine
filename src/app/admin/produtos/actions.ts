"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/permissions";
import {
  canDeleteProductPermanently,
  deleteProductPermanently,
  getProductByIdAdmin,
  searchProductsForRelate,
  setProductStatus,
  type ProductSearchResult,
} from "@/lib/db/products";
import { createColor, type Color } from "@/lib/db/colors";
import { createSizeOption, type SizeOption } from "@/lib/db/sizes";
import { relateProductToGroup } from "@/lib/db/product-groups";
import { saveProductWithVariants, SaveProductWithVariantsError } from "@/lib/db/product-variants";
import { deleteImage } from "@/lib/images/provider";
import { colorSchema } from "@/lib/validation/color";
import { sizeOptionSchema } from "@/lib/validation/size";
import { saveProductVariantsPayloadSchema } from "@/lib/validation/product-variants";

export type SaveProductVariantsActionResult =
  | { ok: true; productId: string }
  | { error: string; fieldErrors?: Record<string, string> };

/**
 * Traduz o `code` controlado devolvido pela RPC (ou por uma violação de
 * unique constraint) em mensagem amigável — a admin nunca vê SQL bruto.
 * Alguns códigos indicam bug de frontend/payload adulterado; esses também
 * viram log interno, mas a mensagem pra admin continua genérica e educada.
 */
const FRIENDLY_SAVE_ERRORS: Record<string, string> = {
  slug_taken: "Este endereço já está sendo usado por outra peça.",
  slug_reserved: "Este endereço pertence ao histórico de outra peça.",
  duplicate_code: "Este código já está cadastrado.",
  duplicate_slug: "Este endereço já está sendo usado por outra peça.",
  duplicate_key: "Um dos dados já está cadastrado.",
  image_not_owned_by_variant: "Não foi possível salvar as fotos. Atualize a página e tente novamente.",
  image_storage_path_required: "Não foi possível salvar as fotos. Atualize a página e tente novamente.",
  variant_not_in_group: "Uma das cores não pertence mais a este modelo. Atualize a página e tente novamente.",
  group_members_incomplete: "As cores desta peça foram alteradas em outra sessão. Atualize a página antes de salvar.",
  variant_in_both_lists: "Não foi possível salvar. Atualize a página e tente novamente.",
  root_product_not_found: "Um dos produtos não foi encontrado. Atualize a página e tente novamente.",
  variant_not_found: "Um dos produtos não foi encontrado. Atualize a página e tente novamente.",
  status_archived_not_allowed: "Não foi possível salvar. Atualize a página e tente novamente.",
  no_variants: "Preencha os dados da peça antes de salvar.",
  color_required_for_multi_variant: "Escolha a cor de cada peça antes de adicionar outra cor.",
  cannot_remove_root_variant: "Não é possível remover a peça que está sendo editada agora.",
  not_authorized: "Você não tem permissão para esta ação.",
};

const INTERNAL_ONLY_ERROR_CODES = new Set([
  "image_not_owned_by_variant",
  "image_storage_path_required",
  "variant_in_both_lists",
  "status_archived_not_allowed",
]);

function friendlySaveError(err: SaveProductWithVariantsError): { error: string } {
  if (INTERNAL_ONLY_ERROR_CODES.has(err.code)) {
    console.error("[saveProductWithVariantsAction]", err.code, err.message);
  }
  return { error: FRIENDLY_SAVE_ERRORS[err.code] ?? "Não foi possível salvar. Tente novamente." };
}

/**
 * Salvamento único e atômico de uma peça + todas as suas cores (RPC
 * save_product_with_variants). Recebe o payload já montado pelo
 * ProductForm (sempre pelo menos 1 variante) — nunca via <form action>
 * tradicional, porque a estrutura é aninhada demais para FormData.
 */
export async function saveProductWithVariantsAction(rawPayload: unknown): Promise<SaveProductVariantsActionResult> {
  await requireAdmin(["admin", "catalog_editor", "master"]);

  const parsed = saveProductVariantsPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const message = flat.formErrors[0] ?? Object.values(flat.fieldErrors).flat().find(Boolean) ?? "Dados inválidos.";
    return { error: message };
  }

  let result;
  try {
    result = await saveProductWithVariants(parsed.data);
  } catch (err) {
    if (err instanceof SaveProductWithVariantsError) return friendlySaveError(err);
    return { error: err instanceof Error ? err.message : "Não foi possível salvar o produto." };
  }

  revalidatePath("/admin/produtos");
  revalidatePath("/novidades");
  revalidatePath("/categoria");
  for (const v of result.variants) revalidatePath(`/produto/${v.slug}`);

  const productId = parsed.data.root_product_id ?? result.variants[0]?.id;
  if (!productId) return { error: "Não foi possível salvar o produto." };

  revalidatePath(`/admin/produtos/${productId}`);
  return { ok: true, productId };
}

/**
 * Cria uma cor nova sem sair do formulário de produto — usada pelo drawer
 * "+ Nova cor" dentro de cada bloco de variante. Reaproveita colorSchema/
 * createColor (mesma validação e gravação de qualquer outro fluxo de cor).
 */
export async function createColorQuickAction(
  name: string,
  hexColor: string | null
): Promise<{ color: Color } | { error: string }> {
  await requireAdmin(["admin", "catalog_editor", "master"]);

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
 * Cria um tamanho novo sem sair do formulário de produto — usada pelo "+
 * Novo tamanho" dentro de cada bloco de variante. Reaproveita
 * sizeOptionSchema/createSizeOption (mesma validação/gravação de
 * /admin/tamanhos), entra ativo e disponível pra qualquer produto futuro.
 */
export async function createSizeQuickAction(label: string): Promise<{ size: SizeOption } | { error: string }> {
  await requireAdmin(["admin", "catalog_editor", "master"]);

  const parsed = sizeOptionSchema.safeParse({ label });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  try {
    const size = await createSizeOption(parsed.data.label);
    return { size };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Não foi possível criar o tamanho.";
    return { error: message.includes("size_options_label_key") ? "Já existe um tamanho com esse nome." : message };
  }
}

/** Busca por nome/código pro link discreto "Localizar peça já cadastrada" (só na edição). */
export async function searchProductsForRelateAction(
  query: string,
  excludeProductId: string
): Promise<ProductSearchResult[]> {
  await requireAdmin(["admin", "catalog_editor", "master"]);
  return searchProductsForRelate(query, excludeProductId);
}

/**
 * Relaciona uma peça já cadastrada como "outra cor do mesmo modelo" do
 * produto atual — caminho específico pra quando as duas cores foram
 * cadastradas separadamente em datas diferentes. Idempotente se já
 * estiver no mesmo grupo; erro amigável se já pertencer a outro grupo
 * (nunca merge automático). Depois de relacionar, a página recarrega os
 * membros do grupo do banco — a nova peça relacionada passa a aparecer
 * como bloco de variante, pronta pra entrar no próximo salvamento.
 */
export async function relateProductToGroupAction(
  currentProductId: string,
  targetProductId: string
): Promise<{ ok: true } | { error: string }> {
  await requireAdmin(["admin", "catalog_editor", "master"]);

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
 * Chamada quando a admin remove, dentro do próprio formulário, uma foto que
 * acabou de subir mas ainda não foi salva em nenhum produto (sem
 * product_images.id, só existe no Storage). Seguro apagar na hora: nada no
 * banco referencia esse arquivo ainda. Nunca chamada para uma foto que já
 * pertence a um produto salvo — remover essas só acontece implicitamente
 * pela reconciliação da RPC no próximo salvamento.
 */
export async function discardUnusedUploadAction(storagePath: string): Promise<void> {
  await requireAdmin(["admin", "catalog_editor", "master"]);
  try {
    await deleteImage("products", storagePath);
  } catch (err) {
    console.error(`[discardUnusedUploadAction] falha ao remover do Storage (${storagePath}):`, err);
  }
}

export type ToggleArchiveResult = { ok: true } | { error: string };

/**
 * Arquivar/restaurar — separado de save_product_with_variants de propósito
 * (arquitetura já aprovada, preservada aqui). Agora devolve um resultado de
 * verdade (`error`) em vez de void: ver o comentário em
 * `setProductStatus` (lib/db/products.ts) sobre a causa real do bug de
 * "clicar em Arquivar não faz nada" — qualquer falha (permissão, produto
 * removido enquanto a lista estava aberta) agora chega até o botão em vez
 * de desaparecer silenciosamente.
 */
export async function toggleArchiveProductAction(id: string, archive: boolean): Promise<ToggleArchiveResult> {
  await requireAdmin(["admin", "catalog_editor", "master"]);

  const existing = await getProductByIdAdmin(id);
  if (!existing) return { error: "Produto não encontrado — atualize a página e tente novamente." };

  try {
    await setProductStatus(id, archive ? "ARCHIVED" : "ACTIVE");
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível atualizar o status do produto." };
  }

  revalidatePath("/admin/produtos");
  revalidatePath("/novidades");
  revalidatePath("/categoria");
  revalidatePath(`/produto/${existing.slug}`);
  return { ok: true };
}

export type DeleteProductPermanentlyResult = { ok: true } | { error: string };

/**
 * Exclusão física — item 3/4/5 da correção original + role `master` (ver
 * migration 20260902100000_add_master_role.sql). Dupla trava:
 * `requireAdmin` garante sessão válida de staff primeiro; a checagem de
 * `role === "master"` logo depois é o que realmente restringe a ação só a
 * quem tiver esse papel — nenhuma outra role passa, mesmo admin.
 * Confirmação por texto ("EXCLUIR") e a checagem de histórico
 * (`canDeleteProductPermanently`) são refeitas aqui no servidor — nunca
 * confia em nada calculado no client.
 */
export async function deleteProductPermanentlyAction(
  id: string,
  confirmationText: string
): Promise<DeleteProductPermanentlyResult> {
  const admin = await requireAdmin(["admin", "catalog_editor", "master"]);

  if (admin.role !== "master") {
    return {
      error: "Exclusão permanente disponível só para o papel master.",
    };
  }

  if (confirmationText.trim().toUpperCase() !== "EXCLUIR") {
    return { error: 'Digite "EXCLUIR" para confirmar.' };
  }

  const existing = await getProductByIdAdmin(id);
  if (!existing) return { error: "Produto não encontrado — atualize a página." };

  const check = await canDeleteProductPermanently(id);
  if (!check.canDelete) {
    return { error: check.reason ?? "Não é possível excluir este produto." };
  }

  try {
    await deleteProductPermanently(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível excluir o produto." };
  }

  revalidatePath("/admin/produtos");
  revalidatePath("/novidades");
  revalidatePath("/categoria");
  return { ok: true };
}
