"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/db/fulfillment";
import { setCustomerReviewOutcome } from "@/lib/db/customers";

export type SetReviewOutcomeActionResult = { ok: true } | { ok: false; error: string };

const OUTCOMES = ["REVIEWED", "DISMISSED", "DOES_NOT_WANT"] as const;

/**
 * Marca o RESULTADO de uma avaliação — SEMPRE ação humana explícita de
 * Admin/Master, nunca automática (ver set_customer_review_outcome, migration
 * 20261116120000_fulfillment_customer_review_backend.sql). `recordId` é só a
 * venda de onde o clique partiu, usada para revalidar a página certa — a RPC
 * já resolve e trava o customer_id real no servidor, nunca confia em nada
 * que vem do cliente.
 */
export async function setCustomerReviewOutcomeAction(
  recordId: string,
  customerId: string,
  outcome: string
): Promise<SetReviewOutcomeActionResult> {
  await requireAdmin(["admin", "master"]);
  if (!isUuid(recordId) || !isUuid(customerId)) return { ok: false, error: "Registro inválido." };
  if (!(OUTCOMES as readonly string[]).includes(outcome)) return { ok: false, error: "Resultado inválido." };

  const result = await setCustomerReviewOutcome({
    customerId,
    outcome: outcome as (typeof OUTCOMES)[number],
    saleId: recordId,
  });
  if (!result.ok) return result;

  revalidatePath(`/admin/faturamento-envios/${recordId}`);
  revalidatePath("/admin/faturamento-envios");
  return { ok: true };
}
