"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/permissions";
import {
  saveProductSizeFitCompatibilities,
  SaveProductSizeFitError,
  type SaveProductSizeFitResult,
} from "@/lib/db/product-size-fit";
import { saveProductSizeFitPayloadSchema } from "@/lib/validation/product-size-fit";

/**
 * Action dedicada para "numerações que veste" — deliberadamente separada
 * de actions.ts (módulo estabilizado do ProductForm/save_product_with_variants).
 * Usada tanto pelo segundo save do ProductForm (depois que o produto já
 * foi salvo pelo mecanismo atual) quanto pela tela "Revisar numerações".
 */

export type SaveProductSizeFitActionResult = { ok: true; result: SaveProductSizeFitResult } | { error: string };

const FRIENDLY_ERRORS: Record<string, string> = {
  not_authorized: "Você não tem permissão para esta ação.",
  invalid_payload: "Dados inválidos.",
  missing_product_id: "Produto não identificado.",
  product_not_found: "Um dos produtos não foi encontrado.",
  missing_label_size: "Tamanho da etiqueta ausente.",
  label_size_not_in_product_sizes: "Um dos tamanhos não existe mais na etiqueta deste produto. Atualize a página.",
  invalid_fit_sizes: "Numerações inválidas.",
  invalid_fit_size_value: "Uma das numerações é inválida.",
  empty_payload: "Nenhum produto informado.",
};

function friendlyError(err: SaveProductSizeFitError): string {
  return FRIENDLY_ERRORS[err.code] ?? "Não foi possível salvar as numerações que a peça veste.";
}

export async function saveProductSizeFitCompatibilityAction(
  rawPayload: unknown
): Promise<SaveProductSizeFitActionResult> {
  await requireAdmin(["admin", "catalog_editor", "master"]);

  const parsed = saveProductSizeFitPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    const flat = parsed.error.flatten();
    const message = flat.formErrors[0] ?? "Dados inválidos.";
    return { error: message };
  }

  try {
    const result = await saveProductSizeFitCompatibilities(parsed.data);
    revalidatePath("/admin/produtos/revisar-numeracoes");
    for (const productId of result.productIds) revalidatePath(`/admin/produtos/${productId}`);
    return { ok: true, result };
  } catch (err) {
    if (err instanceof SaveProductSizeFitError) return { error: friendlyError(err) };
    return { error: err instanceof Error ? err.message : "Não foi possível salvar as numerações que a peça veste." };
  }
}
