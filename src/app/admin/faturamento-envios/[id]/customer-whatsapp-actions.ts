"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/permissions";
import { getFulfillmentRecord, isUuid, logFulfillmentAudit } from "@/lib/db/fulfillment";
import { updateCustomerWhatsapp } from "@/lib/db/customer-whatsapp";
import { normalizeCustomerWhatsapp } from "@/lib/fulfillment/phone";

export type CustomerWhatsappResult = { ok: true } | { ok: false; error: string };

/**
 * Adiciona ou edita o WhatsApp do cliente num registro existente. Só Admin/Master.
 * A auditoria segue o padrão existente de alteração de registro: só o NOME do campo
 * (`changed_fields`), nunca o número.
 */
export async function updateCustomerWhatsappAction(id: string, raw: string): Promise<CustomerWhatsappResult> {
  const admin = await requireAdmin(["admin", "master"]);
  if (!isUuid(id)) return { ok: false, error: "Registro inválido." };

  const parsed = normalizeCustomerWhatsapp(raw);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const current = await getFulfillmentRecord(id);
  if (!current) return { ok: false, error: "Registro não encontrado." };
  if ((current.customer_whatsapp ?? null) === parsed.value) return { ok: true };

  try {
    await updateCustomerWhatsapp(id, parsed.value);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível salvar o WhatsApp." };
  }

  await logFulfillmentAudit({
    recordId: id,
    action: "DELIVERY_UPDATED",
    actorId: admin.id,
    details: { changed_fields: ["customer_whatsapp"] },
  });

  revalidatePath(`/admin/faturamento-envios/${id}`);
  return { ok: true };
}
