import { revalidatePath } from "next/cache";
import type { CurrentAdmin } from "@/lib/auth/permissions";
import { getFulfillmentRecord, isUuid, logFulfillmentAudit, updateFulfillmentDelivery } from "@/lib/db/fulfillment";
import { gainedTrackingInfo, planDeliveryUpdate, shouldAutoSetInTransit } from "@/lib/fulfillment/delivery-update";
import { DELIVERY_UPDATE_FIELD_NAMES, deliveryUpdateSchema } from "@/lib/fulfillment/schema";

export type ApplyDeliveryUpdateResult = { ok: true; recordId: string } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * ÚNICA camada de negócio pra "Atualizar situação" — usada tanto pelo
 * formulário completo do detalhe (`[id]/actions.ts`) quanto pela edição
 * rápida da listagem (`quick-edit-actions.ts`), pra nunca ter duas
 * implementações paralelas da mesma regra (validação, `delivered_at`,
 * auditoria). Cada chamador só decide pra onde redirecionar depois.
 */
export async function applyDeliveryUpdate(id: string, formData: FormData, admin: CurrentAdmin): Promise<ApplyDeliveryUpdateResult> {
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

  // Ao salvar transportadora + rastreio (de vazio pra preenchido) num registro
  // ainda PENDING, sobe pra IN_TRANSIT na mesma operação — só quando o admin
  // não escolheu outro status manualmente (senão a escolha explícita vale).
  const adminKeptStatusUnchanged = parsed.data.delivery_status === current.delivery_status;
  const autoInTransit =
    adminKeptStatusUnchanged &&
    gainedTrackingInfo(
      { carrier: current.carrier, trackingCode: current.tracking_code },
      { carrier: parsed.data.carrier, trackingCode: parsed.data.tracking_code }
    ) &&
    shouldAutoSetInTransit(current.delivery_status);
  const input = autoInTransit ? { ...parsed.data, delivery_status: "IN_TRANSIT" as const } : parsed.data;

  const plan = planDeliveryUpdate(current, input, current.record_source);
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
      auto_in_transit: autoInTransit,
    },
  });

  revalidatePath("/admin/faturamento-envios");
  revalidatePath(`/admin/faturamento-envios/${id}`);
  return { ok: true, recordId: id };
}
