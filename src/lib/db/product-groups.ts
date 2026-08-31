import "server-only";
import { createClient } from "@/lib/supabase/server";

/** Mensagem amigável — nunca expõe grupo/UUID pra admin. */
export class ProductAlreadyInAnotherGroupError extends Error {
  constructor() {
    super("Esta peça já está relacionada a outro conjunto de cores.");
  }
}

/**
 * Garante que um produto tem product_group_id, criando um grupo novo se
 * ainda não tiver. Nunca chamado automaticamente em produto existente —
 * só quando a admin explicitamente decide "cadastrar outra cor" ou
 * "relacionar peça existente" (ver product_group_id em
 * lib/validation/product.ts e o item 18 da especificação: produto antigo
 * só entra nessa estrutura quando editado).
 */
export async function ensureProductGroup(productId: string): Promise<string> {
  const supabase = await createClient();

  const { data: product, error } = await supabase
    .from("products")
    .select("id, product_group_id")
    .eq("id", productId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!product) throw new Error("Produto não encontrado.");
  if (product.product_group_id) return product.product_group_id;

  const { data: group, error: groupError } = await supabase.from("product_groups").insert({}).select("id").single();
  if (groupError) throw new Error(groupError.message);

  const { error: updateError } = await supabase
    .from("products")
    .update({ product_group_id: group.id })
    .eq("id", productId);
  if (updateError) throw new Error(updateError.message);

  return group.id;
}

/**
 * Relaciona um produto já existente como "outra cor do mesmo modelo" do
 * produto atual. Idempotente se o alvo já estiver no mesmo grupo;
 * bloqueia com erro amigável se já pertencer a outro grupo — sem merge
 * automático de grupos nesta versão (item 3 aprovado pelo usuário).
 */
export async function relateProductToGroup(currentProductId: string, targetProductId: string): Promise<void> {
  if (currentProductId === targetProductId) {
    throw new Error("Não é possível relacionar uma peça a ela mesma.");
  }

  const supabase = await createClient();

  const { data: target, error } = await supabase
    .from("products")
    .select("id, product_group_id")
    .eq("id", targetProductId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!target) throw new Error("Peça não encontrada.");

  const groupId = await ensureProductGroup(currentProductId);

  if (target.product_group_id === groupId) return;
  if (target.product_group_id) throw new ProductAlreadyInAnotherGroupError();

  const { error: updateError } = await supabase
    .from("products")
    .update({ product_group_id: groupId })
    .eq("id", targetProductId);
  if (updateError) throw new Error(updateError.message);
}

