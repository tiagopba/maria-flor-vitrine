"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/permissions";
import { getFulfillmentRecord, isUuid, logFulfillmentAudit, saveTrackingInfo } from "@/lib/db/fulfillment";
import { trackingInfoSchema } from "@/lib/fulfillment/schema";

export type SaveTrackingResult = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string>;
};

/**
 * SALVAR RASTREAMENTO: usada tanto no detalhe de um registro quanto na tela de
 * bloqueio de Nova Venda — `returnTo` é o primeiro argumento (currying via
 * `.bind(null, returnTo)`, igual o padrão de Server Action com contexto extra).
 * Só grava tracking_code + carrier e audita TRACKING_CODE_SAVED; nunca toca em
 * delivery_status nem em outro dado da venda.
 */
export async function saveTrackingAction(returnTo: string, recordId: string, formData: FormData): Promise<SaveTrackingResult> {
  const admin = await requireAdmin(["admin", "master"]);
  if (!isUuid(recordId)) return { ok: false, error: "Registro inválido." };

  const parsed = trackingInfoSchema.safeParse({
    carrier: formData.get("carrier"),
    trackingCode: formData.get("trackingCode"),
  });
  if (!parsed.success) {
    const flat = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
    return {
      ok: false,
      error: "Corrija os campos destacados antes de salvar.",
      fieldErrors: Object.fromEntries(Object.entries(flat).map(([key, messages]) => [key, messages?.[0] ?? ""])),
    };
  }

  const current = await getFulfillmentRecord(recordId);
  if (!current) return { ok: false, error: "Registro não encontrado." };
  const carrierPrefilled = Boolean(current.carrier);

  try {
    await saveTrackingInfo(recordId, { trackingCode: parsed.data.trackingCode, carrier: parsed.data.carrier });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível salvar o rastreamento." };
  }

  // Só metadados técnicos: nunca o código de rastreio nem outro dado pessoal.
  await logFulfillmentAudit({
    recordId,
    action: "TRACKING_CODE_SAVED",
    actorId: admin.id,
    details: { carrier: parsed.data.carrier, source: "ADMIN", carrier_prefilled: carrierPrefilled },
  });

  revalidatePath("/admin/faturamento-envios");
  revalidatePath(`/admin/faturamento-envios/${recordId}`);
  revalidatePath("/admin/faturamento-envios/pre/nova");
  redirect(`${returnTo}${returnTo.includes("?") ? "&" : "?"}sucesso=${encodeURIComponent("Rastreamento salvo.")}`);
}
