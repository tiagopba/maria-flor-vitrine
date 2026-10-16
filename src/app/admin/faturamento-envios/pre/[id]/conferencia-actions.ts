"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/permissions";
import { FULFILLMENT_BUCKET, isUuid } from "@/lib/db/fulfillment";
import {
  approveIntakeRpc,
  getIntakeRow,
  hasActiveLegacyFreightOverride,
  insertAttempt,
  insertIntakeAudit,
  listAttempts,
  markAttemptReviewed,
  setIntakeStatusRow,
  type AttemptRow,
} from "@/lib/db/intakes";
import { createClient } from "@/lib/supabase/server";
import { parseNfeXml } from "@/lib/fulfillment/parse-nfe-xml";
import { normalizeForCompare } from "@/lib/fulfillment/text";
import { canApprove, type ConfereResult } from "@/lib/intake/confere";
import { conferirXml, type ConfereXmlOutcome } from "@/lib/intake/conferir-xml";
import { canApproveIntake, canUploadDocuments, type IntakeStatus } from "@/lib/intake/status";

export type ConferenciaResult =
  | { ok: true; attemptNo: number; verdict: "GREEN" | "REVIEW" | "BLOCKED" }
  | { ok: false; error: string };

const MAX_XML_BYTES = 2 * 1024 * 1024;

async function readXml(value: FormDataEntryValue | null): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (!(value instanceof File) || value.size === 0) return { ok: false, error: "Selecione o XML da NF-e." };
  if (value.size > MAX_XML_BYTES) return { ok: false, error: "O XML é maior que 2MB." };
  if (!value.name.toLowerCase().endsWith(".xml")) return { ok: false, error: "Selecione um arquivo .xml (o XML da NF-e, não a DANFE nem a etiqueta)." };
  return { ok: true, text: await value.text() };
}

/**
 * INICIAR CONFERÊNCIA / REVISAR E RECOMEÇAR: cada envio de XML é uma NOVA tentativa.
 * A anterior fica como histórico; a conferência é recalculada do zero. Fluxo XML-only:
 * nunca mais pede DANFE nem etiqueta aqui — tentativas antigas com os dois PDFs
 * continuam existindo e visíveis, só não são criadas por este caminho.
 */
export async function startConferenciaAction(intakeId: string, formData: FormData): Promise<ConferenciaResult> {
  const admin = await requireAdmin(["admin", "master"]);
  if (!isUuid(intakeId)) return { ok: false, error: "Solicitação inválida." };

  const row = await getIntakeRow(intakeId);
  if (!row) return { ok: false, error: "Solicitação não encontrada." };
  if (!canUploadDocuments(row.status as IntakeStatus)) {
    return { ok: false, error: "Esta solicitação não aceita documentos agora." };
  }
  if (!row.submitted_name || !row.submitted_cpf || !row.submitted_address_line || !row.submitted_postal_code) {
    return { ok: false, error: "A cliente ainda não enviou os dados." };
  }

  const xmlFile = await readXml(formData.get("xml"));
  if (!xmlFile.ok) return { ok: false, error: xmlFile.error };

  const parsed = parseNfeXml(xmlFile.text);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  // Só true quando este intake específico tem um override de frete legado
  // ativo e auditado (fulfillment_intake_legacy_overrides) — nunca um
  // padrão por data ou por qualquer outra regra implícita.
  const legacyFreightOverrideActive = await hasActiveLegacyFreightOverride(intakeId);

  const outcome: ConfereXmlOutcome = conferirXml({
    expected: {
      customerName: row.submitted_name,
      cpf: row.submitted_cpf,
      address: {
        street: row.submitted_address_line,
        number: row.submitted_address_number,
        complement: row.submitted_address_complement,
        neighborhood: row.submitted_neighborhood,
        city: row.submitted_city,
        state: row.submitted_state,
        postalCode: row.submitted_postal_code,
      },
      recipientName: row.submitted_delivery_to_customer ? row.submitted_name : (row.submitted_recipient_name ?? ""),
      saleTotal: Number(row.sale_total),
      legacyFreightOverrideActive,
    },
    xml: parsed.data,
  });

  const previous = await listAttempts(intakeId);
  const attemptNo = (previous[0]?.attempt_no ?? 0) + 1;
  const xmlPath = `intakes/${intakeId}/attempt-${attemptNo}/nfe.xml`;

  const supabase = await createClient();
  const { error: uploadError } = await supabase.storage
    .from(FULFILLMENT_BUCKET)
    .upload(xmlPath, new TextEncoder().encode(xmlFile.text), { contentType: "application/xml", upsert: false });
  if (uploadError) return { ok: false, error: `Não foi possível guardar o XML: ${uploadError.message}` };

  await insertAttempt({
    intakeId,
    attemptNo,
    verdict: outcome.verdict,
    blockingFields: outcome.blocking.map((r) => r.field),
    reviewFields: outcome.reviewFields,
    comparison: { results: outcome.results.map(({ field, verdict, reason }) => ({ field, verdict, reason })), extracted: outcome.extracted },
    xmlPath,
    actorId: admin.id,
  });

  const nextStatus: IntakeStatus =
    outcome.verdict === "GREEN" ? "CHECKING" : outcome.verdict === "REVIEW" ? "REVIEW_REQUIRED" : "BLOCKED";
  await setIntakeStatusRow(intakeId, nextStatus);

  // Auditoria SEM PII: só nomes de campos e o veredito.
  if (attemptNo > 1) {
    await insertIntakeAudit({ intakeId, action: "INTAKE_CHECK_RESTARTED", actorId: admin.id, details: { attempt: attemptNo } });
  }
  await insertIntakeAudit({
    intakeId,
    action: "INTAKE_CHECK_STARTED",
    actorId: admin.id,
    details: { attempt: attemptNo, verdict: outcome.verdict },
  });
  if (outcome.verdict === "BLOCKED") {
    await insertIntakeAudit({
      intakeId,
      action: "INTAKE_BLOCKED",
      actorId: admin.id,
      details: { attempt: attemptNo, fields: outcome.blocking.map((r) => r.field) },
    });
  }

  revalidatePath(`/admin/faturamento-envios/pre/${intakeId}`);
  return { ok: true, attemptNo, verdict: outcome.verdict };
}

/** Marca avisos como revisados (só os da tentativa atual e só os que são avisos). */
export async function markReviewedAction(intakeId: string, attemptNo: number, fields: string[]): Promise<ConferenciaResult> {
  const admin = await requireAdmin(["admin", "master"]);
  if (!isUuid(intakeId)) return { ok: false, error: "Solicitação inválida." };

  const attempts = await listAttempts(intakeId);
  const latest = attempts[0];
  if (!latest || latest.attempt_no !== attemptNo) return { ok: false, error: "Só a tentativa atual pode ser revisada." };
  if (latest.verdict !== "REVIEW") return { ok: false, error: "Esta tentativa não tem avisos para revisar." };

  const valid = fields.filter((f) => latest.review_fields.includes(f));
  await markAttemptReviewed(latest.id, valid);
  await insertIntakeAudit({ intakeId, action: "INTAKE_REVIEW_COMPLETED", actorId: admin.id, details: { attempt: attemptNo, fields: valid } });
  revalidatePath(`/admin/faturamento-envios/pre/${intakeId}`);
  return { ok: true, attemptNo, verdict: "REVIEW" };
}

/**
 * CONFIRMAR CONFERÊNCIA: só a tentativa mais recente, nunca BLOCKED,
 * e com todos os avisos revisados. A regra final fica no banco (approve_fulfillment_intake).
 */
export async function approveConferenciaAction(intakeId: string, attemptNo: number): Promise<{ ok: true; recordId: string } | { ok: false; error: string }> {
  await requireAdmin(["admin", "master"]);
  if (!isUuid(intakeId)) return { ok: false, error: "Solicitação inválida." };

  const row = await getIntakeRow(intakeId);
  if (!row) return { ok: false, error: "Solicitação não encontrada." };
  if (!canApproveIntake(row.status as IntakeStatus)) return { ok: false, error: "Esta solicitação não pode ser aprovada no estado atual." };
  const attempts = await listAttempts(intakeId);
  const attempt: AttemptRow | undefined = attempts[0];
  if (!attempt || attempt.attempt_no !== attemptNo) return { ok: false, error: "Só a tentativa atual pode ser aprovada." };

  const gate = canApprove(
    { verdict: attempt.verdict, blocking: [], review: [], reviewFields: attempt.review_fields } as ConfereResult,
    attempt.reviewed_fields
  );
  if (!gate.ok) return { ok: false, error: gate.error };

  const extracted = (attempt.comparison as { extracted?: Record<string, string | number | null> }).extracted ?? {};
  const record = {
    id: randomUUID(),
    customer_name: row.submitted_name,
    customer_name_search: normalizeForCompare(row.submitted_name),
    customer_cpf: row.submitted_cpf,
    customer_whatsapp: row.submitted_whatsapp,
    address_line: row.submitted_address_line,
    address_number: row.submitted_address_number,
    address_complement: row.submitted_address_complement,
    neighborhood: row.submitted_neighborhood,
    postal_code: row.submitted_postal_code,
    city: row.submitted_city,
    state: row.submitted_state,
    nfe_number: extracted.nfe_number ?? null,
    nfe_series: extracted.nfe_series ?? null,
    nfe_key: extracted.nfe_key ?? null,
    nfe_protocol: extracted.nfe_protocol ?? null,
    nfe_issued_at: extracted.nfe_issued_at ?? null,
    items_count: extracted.items_count ?? null,
    invoice_total: extracted.invoice_total ?? null,
    carrier: extracted.carrier ?? null,
    shipping_service: extracted.shipping_service ?? null,
    tracking_code: extracted.tracking_code ?? null,
    shipping_label_date: extracted.shipping_label_date ?? null,
    // Um dos dois conjuntos vem null: fluxo antigo tem danfe+label e xml null;
    // fluxo XML-only tem xml e os dois outros null. A RPC aceita qualquer um.
    danfe_file_path: attempt.danfe_file_path,
    label_file_path: attempt.label_file_path,
    xml_file_path: attempt.xml_file_path,
  };

  try {
    const recordId = await approveIntakeRpc(intakeId, attemptNo, record);
    revalidatePath("/admin/faturamento-envios");
    revalidatePath(`/admin/faturamento-envios/pre/${intakeId}`);
    return { ok: true, recordId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível aprovar." };
  }
}
