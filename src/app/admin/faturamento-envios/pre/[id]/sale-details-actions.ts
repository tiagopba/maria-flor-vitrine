"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/permissions";
import { isActiveSeller, isUuid } from "@/lib/db/fulfillment";
import { getIntakeRow, insertIntakeAudit, listAttempts, updateIntakeSaleDetails } from "@/lib/db/intakes";
import { editIntakeSaleDetailsSchema } from "@/lib/intake/schema";
import { planIntakeSaleDetailsUpdate } from "@/lib/intake/sale-details";
import type { IntakeStatus } from "@/lib/intake/status";

export type EditIntakeSaleResult = { ok: true; forcedDocumentsPending: boolean } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * EDITAR VENDA (pré-aprovação). O estado "atual" (status, valores, se já existe
 * tentativa) vem SEMPRE do banco, lido de novo aqui dentro — nunca do que a tela
 * mostrava quando o modal abriu. Um request adulterado que tente manter o status
 * CHECKING/REVIEW_REQUIRED depois de mudar o valor não tem como: quem decide o
 * status é só este servidor, com o que leu agora.
 */
export async function updateIntakeSaleDetailsAction(intakeId: string, raw: Record<string, string>): Promise<EditIntakeSaleResult> {
  const admin = await requireAdmin(["admin", "master"]);
  if (!isUuid(intakeId)) return { ok: false, error: "Solicitação inválida." };

  const parsed = editIntakeSaleDetailsSchema.safeParse({
    saleTotal: raw.saleTotal ?? "",
    saleDate: raw.saleDate ?? "",
    sellerId: raw.sellerId ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, error: "Corrija os campos destacados.", fieldErrors };
  }
  if (!(await isActiveSeller(parsed.data.sellerId))) {
    return { ok: false, error: "Escolha uma vendedora ativa.", fieldErrors: { sellerId: "Vendedora inválida ou inativa." } };
  }

  const row = await getIntakeRow(intakeId);
  if (!row) return { ok: false, error: "Solicitação não encontrada." };

  const attempts = await listAttempts(intakeId);
  const plan = planIntakeSaleDetailsUpdate(
    {
      status: row.status as IntakeStatus,
      saleTotal: Number(row.sale_total),
      saleDate: row.sale_date,
      sellerId: row.seller_id,
      hasAnyAttempt: attempts.length > 0,
    },
    parsed.data
  );
  if (!plan.ok) return { ok: false, error: plan.error };

  const written = await updateIntakeSaleDetails({ id: intakeId, update: plan.update, forceDocumentsPending: plan.forceDocumentsPending });
  if (!written) {
    return { ok: false, error: "Não foi possível salvar: a venda pode ter sido aprovada ou cancelada nesse meio tempo." };
  }

  // Campos chatos (flat), nunca um objeto aninhado: previous_<campo>/new_<campo>, só
  // para o que realmente mudou. Sem PII — valor, data e id da vendedora não são
  // dados pessoais da cliente.
  const details: Record<string, string | number | boolean | string[]> = {
    changed_fields: plan.changedFields,
    forced_documents_pending: plan.forceDocumentsPending,
  };
  if (plan.changedFields.includes("sale_total")) {
    details.previous_sale_total = Number(row.sale_total);
    details.new_sale_total = parsed.data.saleTotal;
  }
  if (plan.changedFields.includes("sale_date")) {
    details.previous_sale_date = row.sale_date;
    details.new_sale_date = parsed.data.saleDate;
  }
  if (plan.changedFields.includes("seller_id")) {
    details.previous_seller_id = row.seller_id ?? "";
    details.new_seller_id = parsed.data.sellerId;
  }

  await insertIntakeAudit({ intakeId, action: "INTAKE_EDITED", actorId: admin.id, details });

  revalidatePath(`/admin/faturamento-envios/pre/${intakeId}`);
  revalidatePath("/admin/faturamento-envios/pre");
  return { ok: true, forcedDocumentsPending: plan.forceDocumentsPending };
}
