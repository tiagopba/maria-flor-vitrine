"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/permissions";
import {
  deleteFreeShippingRule,
  setFreeShippingRuleActive,
  upsertFreeShippingRule,
} from "@/lib/db/shipping";
import { freeShippingRuleSchema } from "@/lib/validation/free-shipping";

/**
 * Ações dedicadas de Frete grátis — só ADMIN/MASTER (nunca catalog_editor
 * nem seller), mesmo nível de acesso de Configurações do Site/Pagamento.
 */
export type FreeShippingActionResult = { ok: true } | { error: string };
export type UpsertFreeShippingActionResult = { ok: true; id: string } | { error: string };

export async function upsertFreeShippingRuleAction(rawInput: unknown): Promise<UpsertFreeShippingActionResult> {
  await requireAdmin(["admin", "master"]);

  const parsed = freeShippingRuleSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  let id: string;
  try {
    id = await upsertFreeShippingRule({
      stateCode: parsed.data.state_code,
      service: parsed.data.service,
      minimumAmount: parsed.data.minimum_amount,
      active: parsed.data.active,
    });
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível salvar a regra de frete." };
  }

  revalidatePath("/admin/configuracoes");
  return { ok: true, id };
}

export async function toggleFreeShippingRuleAction(id: string, active: boolean): Promise<FreeShippingActionResult> {
  await requireAdmin(["admin", "master"]);

  try {
    await setFreeShippingRuleActive(id, active);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível atualizar a regra." };
  }

  revalidatePath("/admin/configuracoes");
  return { ok: true };
}

export async function deleteFreeShippingRuleAction(id: string): Promise<FreeShippingActionResult> {
  await requireAdmin(["admin", "master"]);

  try {
    await deleteFreeShippingRule(id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Não foi possível remover a regra." };
  }

  revalidatePath("/admin/configuracoes");
  return { ok: true };
}
