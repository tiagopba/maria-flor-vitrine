"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/permissions";
import { getFulfillmentRecord, isUuid, logFulfillmentAudit, sellerExists, updateFulfillmentSaleDetails } from "@/lib/db/fulfillment";
import { editRecordSaleDetailsSchema } from "@/lib/fulfillment/schema";
import { planRecordSaleDetailsUpdate } from "@/lib/fulfillment/sale-details";

export type EditRecordSaleResult = { ok: true } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * EDITAR DADOS DA VENDA (pós-aprovação). Só vendedora, data e origem — o formulário
 * nem tem campo para o valor da venda (editRecordSaleDetailsSchema), então não existe
 * como um request adulterado alterar esse valor por aqui.
 */
export async function updateRecordSaleDetailsAction(recordId: string, raw: Record<string, string>): Promise<EditRecordSaleResult> {
  const admin = await requireAdmin(["admin", "master"]);
  if (!isUuid(recordId)) return { ok: false, error: "Registro inválido." };

  const parsed = editRecordSaleDetailsSchema.safeParse({
    saleDate: raw.saleDate ?? "",
    sellerId: raw.sellerId ?? "",
    salesOrigin: raw.salesOrigin ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, error: "Corrija os campos destacados.", fieldErrors };
  }
  if (parsed.data.sellerId && !(await sellerExists(parsed.data.sellerId))) {
    return { ok: false, error: "Vendedora não encontrada.", fieldErrors: { sellerId: "Vendedora não encontrada." } };
  }

  const record = await getFulfillmentRecord(recordId);
  if (!record) return { ok: false, error: "Registro não encontrado." };

  const plan = planRecordSaleDetailsUpdate(
    { saleDate: record.sale_date, sellerId: record.seller_id, salesOrigin: record.sales_origin },
    parsed.data
  );
  if (!plan.ok) return { ok: false, error: plan.error };

  try {
    await updateFulfillmentSaleDetails(recordId, plan.update);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível atualizar o registro." };
  }

  const details: Record<string, string | number | boolean | string[]> = { changed_fields: plan.changedFields };
  if (plan.changedFields.includes("sale_date")) {
    details.previous_sale_date = record.sale_date;
    details.new_sale_date = parsed.data.saleDate;
  }
  if (plan.changedFields.includes("seller_id")) {
    details.previous_seller_id = record.seller_id ?? "";
    details.new_seller_id = parsed.data.sellerId ?? "";
  }
  if (plan.changedFields.includes("sales_origin")) {
    details.previous_sales_origin = record.sales_origin ?? "";
    details.new_sales_origin = parsed.data.salesOrigin ?? "";
  }

  await logFulfillmentAudit({ recordId, action: "SALE_DETAILS_UPDATED", actorId: admin.id, details });

  revalidatePath("/admin/faturamento-envios");
  revalidatePath(`/admin/faturamento-envios/${recordId}`);
  return { ok: true };
}
