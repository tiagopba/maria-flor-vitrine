"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/permissions";
import { isActiveSeller, isUuid } from "@/lib/db/fulfillment";
import { editIntakeRpc, getIntakeRow } from "@/lib/db/intakes";
import { editCustomerSchema, editSaleSchema } from "@/lib/intake/edit-schema";
import { validateEditReasonInput } from "@/lib/intake/edit";
import { canEditIntake, type IntakeStatus } from "@/lib/intake/status";

export type EditIntakeResult = { ok: true; fieldsChanged: string[] } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/**
 * EDITAR DADOS: só Admin/Master (checado no servidor, não só escondendo o botão).
 * Permitido em qualquer estado, exceto aprovada ou cancelada. Este Server Action só
 * valida e normaliza (Zod) e faz UMA chamada a `edit_fulfillment_intake` — a função
 * SQL decide sozinha o que mudou, se a conferência precisa ser invalidada, e grava
 * UPDATE + audit log + histórico privado numa única transação atômica. Nada aqui
 * depende da ordem de chamadas deste módulo: se o banco recusar qualquer parte,
 * nada fica salvo.
 */
export async function editIntakeAction(id: string, raw: Record<string, unknown>): Promise<EditIntakeResult> {
  await requireAdmin(["admin", "master"]);
  if (!isUuid(id)) return { ok: false, error: "Solicitação inválida." };

  const reasonResult = validateEditReasonInput({ reason: raw.reason, note: raw.note });
  if (!reasonResult.ok) return { ok: false, error: "Confira o motivo da correção.", fieldErrors: reasonResult.fieldErrors };

  const row = await getIntakeRow(id);
  if (!row) return { ok: false, error: "Solicitação não encontrada." };
  if (!canEditIntake(row.status as IntakeStatus)) {
    return { ok: false, error: "Esta solicitação já foi aprovada ou cancelada e não pode ser editada." };
  }

  const saleParsed = editSaleSchema.safeParse({
    sti3SaleId: raw.sti3SaleId ?? "",
    customerName: raw.customerName ?? "",
    customerWhatsapp: raw.customerWhatsapp ?? "",
    sellerId: raw.sellerId ?? "",
    saleDate: raw.saleDate ?? "",
    saleTotal: raw.saleTotal ?? "",
    paymentMethod: raw.paymentMethod ?? "",
    internalNotes: raw.internalNotes ?? "",
  });
  if (!saleParsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of saleParsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, error: "Corrija os campos destacados.", fieldErrors };
  }

  if (saleParsed.data.sellerId !== row.seller_id && !(await isActiveSeller(saleParsed.data.sellerId))) {
    return { ok: false, error: "Escolha uma vendedora ativa.", fieldErrors: { sellerId: "Vendedora inválida ou inativa." } };
  }

  const patch: Record<string, unknown> = {
    sti3_sale_id: saleParsed.data.sti3SaleId,
    customer_name: saleParsed.data.customerName,
    customer_whatsapp: saleParsed.data.customerWhatsapp,
    seller_id: saleParsed.data.sellerId,
    sale_date: saleParsed.data.saleDate,
    sale_total: saleParsed.data.saleTotal,
    payment_method: saleParsed.data.paymentMethod,
    internal_notes: saleParsed.data.internalNotes,
  };

  // Dados da cliente só existem (e só podem ser editados) depois que ela enviou pelo link público.
  // A presença da chave "submitted_name" no patch é o sinal que a função SQL usa para
  // saber se este bloco deve ser aplicado — nunca envia o bloco pela metade.
  const received = row.status !== "AWAITING_CUSTOMER_DATA";
  if (received) {
    const customerParsed = editCustomerSchema.safeParse({
      submittedName: raw.submittedName ?? "",
      submittedCpf: raw.submittedCpf ?? "",
      submittedEmail: raw.submittedEmail ?? "",
      submittedWhatsapp: raw.submittedWhatsapp ?? "",
      submittedDeliveryToCustomer: raw.submittedDeliveryToCustomer === true || raw.submittedDeliveryToCustomer === "true",
      submittedRecipientName: raw.submittedRecipientName ?? "",
      submittedPostalCode: raw.submittedPostalCode ?? "",
      submittedAddressLine: raw.submittedAddressLine ?? "",
      submittedAddressNumber: raw.submittedAddressNumber ?? "",
      submittedAddressComplement: raw.submittedAddressComplement ?? "",
      submittedNeighborhood: raw.submittedNeighborhood ?? "",
      submittedCity: raw.submittedCity ?? "",
      submittedState: raw.submittedState ?? "",
    });
    if (!customerParsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of customerParsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
      return { ok: false, error: "Corrija os campos destacados.", fieldErrors };
    }

    const c = customerParsed.data;
    patch.submitted_name = c.submittedName;
    patch.submitted_cpf = c.submittedCpf;
    patch.submitted_email = c.submittedEmail;
    patch.submitted_whatsapp = c.submittedWhatsapp;
    patch.submitted_delivery_to_customer = c.submittedDeliveryToCustomer;
    patch.submitted_recipient_name = c.submittedDeliveryToCustomer ? null : c.submittedRecipientName;
    patch.submitted_postal_code = c.submittedPostalCode;
    patch.submitted_address_line = c.submittedAddressLine;
    patch.submitted_address_number = c.submittedAddressNumber;
    patch.submitted_address_complement = c.submittedAddressComplement;
    patch.submitted_neighborhood = c.submittedNeighborhood;
    patch.submitted_city = c.submittedCity;
    patch.submitted_state = c.submittedState;
  }

  try {
    const result = await editIntakeRpc(id, patch, reasonResult.reason, reasonResult.note);
    revalidatePath(`/admin/faturamento-envios/pre/${id}`);
    revalidatePath("/admin/faturamento-envios/pre");
    return { ok: true, fieldsChanged: result.fields };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível salvar." };
  }
}
