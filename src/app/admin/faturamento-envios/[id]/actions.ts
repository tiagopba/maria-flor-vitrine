"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/permissions";
import { getFulfillmentRecord, isUuid, logFulfillmentAudit, updateFulfillmentDelivery } from "@/lib/db/fulfillment";
import { planDeliveryUpdate } from "@/lib/fulfillment/delivery-update";
import { DELIVERY_UPDATE_FIELD_NAMES, deliveryUpdateSchema } from "@/lib/fulfillment/schema";

export type UpdateDeliveryResult = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string>;
};

/**
 * "Atualizar situação": só campos operacionais (status, previsão, entrega,
 * observações, transportadora/serviço/rastreio). Dados do cliente e os PDFs
 * nunca passam por aqui.
 */
export async function updateDeliveryAction(id: string, formData: FormData): Promise<UpdateDeliveryResult> {
  const admin = await requireAdmin(["admin", "master"]);
  if (!isUuid(id)) return { ok: false, error: "Registro inválido." };

  const raw = Object.fromEntries(
    DELIVERY_UPDATE_FIELD_NAMES.map((name) => {
      const value = formData.get(name);
      return [name, typeof value === "string" ? value : ""];
    })
  );

  const parsed = deliveryUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
    return {
      ok: false,
      error: "Corrija os campos destacados antes de salvar.",
      fieldErrors: Object.fromEntries(Object.entries(flat).map(([key, messages]) => [key, messages?.[0] ?? ""])),
    };
  }

  // O estado "anterior" vem sempre do banco, nunca do navegador.
  const current = await getFulfillmentRecord(id);
  if (!current) return { ok: false, error: "Registro não encontrado." };

  const plan = planDeliveryUpdate(current, parsed.data);
  if (!plan.ok) return plan;

  try {
    await updateFulfillmentDelivery(id, plan.update);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível atualizar o registro." };
  }

  // Só metadados seguros: status anterior/novo e NOMES dos campos alterados — nunca valores.
  await logFulfillmentAudit({
    recordId: id,
    action: "DELIVERY_UPDATED",
    actorId: admin.id,
    details: {
      previous_status: plan.previousStatus,
      new_status: plan.newStatus,
      changed_fields: plan.changedFields,
    },
  });

  revalidatePath("/admin/faturamento-envios");
  revalidatePath(`/admin/faturamento-envios/${id}`);
  redirect(`/admin/faturamento-envios/${id}?sucesso=${encodeURIComponent("Situação atualizada.")}`);
}
