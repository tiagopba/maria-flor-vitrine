import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

export type IntakeRow = Database["public"]["Tables"]["fulfillment_intakes"]["Row"];
export type IntakeAuditAction = Database["public"]["Tables"]["fulfillment_intake_audit_logs"]["Row"]["action"];

const INTAKE_COLUMNS =
  "id, seller_id, sale_date, customer_name, customer_whatsapp, sale_total, payment_method, installments, sti3_sale_id, internal_notes, status, token_expires_at, submitted_at, submitted_name, submitted_cpf, submitted_email, submitted_whatsapp, submitted_delivery_to_customer, submitted_recipient_name, submitted_postal_code, submitted_address_line, submitted_address_number, submitted_address_complement, submitted_neighborhood, submitted_city, submitted_state, approved_record_id, created_at, updated_at";

// ── Admin/Master (sessão + RLS is_admin()) ─────────────────────────────────────

export async function createIntakeRow(input: {
  sellerId: string | null;
  saleDate: string;
  customerName: string;
  customerWhatsapp: string;
  saleTotal: number;
  paymentMethod: IntakeRow["payment_method"];
  sti3SaleId: string;
  internalNotes: string | null;
  tokenHash: string;
  expiresAt: string;
  createdBy: string;
}): Promise<{ id: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fulfillment_intakes")
    .insert({
      seller_id: input.sellerId,
      sale_date: input.saleDate,
      customer_name: input.customerName,
      customer_whatsapp: input.customerWhatsapp,
      sale_total: input.saleTotal,
      payment_method: input.paymentMethod,
      // Parcelamento não existe mais no fluxo novo: a coluna fica NULL.
      installments: null,
      sti3_sale_id: input.sti3SaleId,
      internal_notes: input.internalNotes,
      token_hash: input.tokenHash,
      token_expires_at: input.expiresAt,
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Não foi possível criar a solicitação.");
  return { id: data.id };
}

export async function listIntakes(): Promise<Pick<IntakeRow, "id" | "customer_name" | "sale_date" | "sale_total" | "status" | "submitted_at" | "created_at" | "token_expires_at" | "sti3_sale_id" | "cancelled_at" | "cancel_reason">[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fulfillment_intakes")
    .select("id, customer_name, sale_date, sale_total, status, submitted_at, created_at, token_expires_at, sti3_sale_id, cancelled_at, cancel_reason")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getIntakeRow(id: string): Promise<IntakeRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fulfillment_intakes").select(INTAKE_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as IntakeRow | null) ?? null;
}

/** REABRIR COLETA: troca o token (o anterior deixa de valer), zera o envio e reinicia a validade. */
export async function reopenIntake(input: {
  id: string;
  tokenHash: string;
  expiresAt: string;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("fulfillment_intakes")
    .update({
      token_hash: input.tokenHash,
      token_expires_at: input.expiresAt,
      status: "AWAITING_CUSTOMER_DATA",
      submitted_at: null,
      submitted_name: null,
      submitted_cpf: null,
      submitted_email: null,
      submitted_whatsapp: null,
      submitted_delivery_to_customer: null,
      submitted_recipient_name: null,
      submitted_postal_code: null,
      submitted_address_line: null,
      submitted_address_number: null,
      submitted_address_complement: null,
      submitted_neighborhood: null,
      submitted_city: null,
      submitted_state: null,
    })
    .eq("id", input.id)
    .not("status", "in", "(APPROVED,CANCELLED)")
    .neq("status", "APPROVED");
  if (error) throw new Error(error.message);
}

export async function insertIntakeAudit(input: {
  intakeId: string;
  action: IntakeAuditAction;
  actorId: string | null;
  details?: Record<string, string | number | boolean | string[]>;
}): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from("fulfillment_intake_audit_logs").insert({
    intake_id: input.intakeId,
    action: input.action,
    actor_id: input.actorId,
    details: input.details ?? {},
  });
  if (error) throw new Error(error.message);
}

// ── Link público (servidor; a cliente nunca acessa a tabela) ──────────────────

export async function findIntakeByTokenHash(tokenHash: string): Promise<IntakeRow | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("fulfillment_intakes").select(INTAKE_COLUMNS).eq("token_hash", tokenHash).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as IntakeRow | null) ?? null;
}

/**
 * Grava os dados da cliente UMA vez. A condição no UPDATE garante que só entra
 * se ainda estiver aguardando e sem envio anterior (sem corrida entre duas abas).
 */
export async function submitIntakeData(
  id: string,
  tokenHash: string,
  data: Record<string, string | boolean | null>
): Promise<boolean> {
  const supabase = createAdminClient();
  const { data: updated, error } = await supabase
    .from("fulfillment_intakes")
    .update({
      ...data,
      status: "DATA_RECEIVED",
      submitted_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("token_hash", tokenHash)
    .eq("status", "AWAITING_CUSTOMER_DATA")
    .is("submitted_at", null)
    .select("id");
  if (error) throw new Error(error.message);
  return (updated ?? []).length === 1;
}

/** Eventos do sistema (sem ator humano), sem PII. */
export async function insertIntakeAuditSystem(intakeId: string, action: IntakeAuditAction): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("fulfillment_intake_audit_logs").insert({ intake_id: intakeId, action, actor_id: null, details: {} });
  if (error) throw new Error(error.message);
}

// ── Tentativas de conferência (histórico; nunca apagadas) ─────────────────────

export type AttemptRow = Database["public"]["Tables"]["fulfillment_verification_attempts"]["Row"];

export async function listAttempts(intakeId: string): Promise<AttemptRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fulfillment_verification_attempts")
    .select("id, intake_id, attempt_no, verdict, blocking_fields, review_fields, reviewed_fields, comparison, danfe_file_path, label_file_path, actor_id, created_at")
    .eq("intake_id", intakeId)
    .order("attempt_no", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function insertAttempt(input: {
  intakeId: string;
  attemptNo: number;
  verdict: AttemptRow["verdict"];
  blockingFields: string[];
  reviewFields: string[];
  comparison: Record<string, unknown>;
  danfePath: string;
  labelPath: string;
  actorId: string;
}): Promise<AttemptRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("fulfillment_verification_attempts")
    .insert({
      intake_id: input.intakeId,
      attempt_no: input.attemptNo,
      verdict: input.verdict,
      blocking_fields: input.blockingFields,
      review_fields: input.reviewFields,
      reviewed_fields: [],
      comparison: input.comparison,
      danfe_file_path: input.danfePath,
      label_file_path: input.labelPath,
      actor_id: input.actorId,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Não foi possível registrar a tentativa.");
  return data;
}

export async function markAttemptReviewed(attemptId: string, reviewedFields: string[]): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("fulfillment_verification_attempts")
    .update({ reviewed_fields: reviewedFields })
    .eq("id", attemptId);
  if (error) throw new Error(error.message);
}

export async function setIntakeStatusRow(id: string, status: IntakeRow["status"]): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("fulfillment_intakes")
    .update({ status })
    .eq("id", id)
    .not("status", "in", "(APPROVED,CANCELLED)");
  if (error) throw new Error(error.message);
}

/** Aprovação atômica no banco (ver approve_fulfillment_intake). Sessão do Admin, para is_admin() valer. */
export async function approveIntakeRpc(intakeId: string, attemptNo: number, record: Record<string, unknown>): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("approve_fulfillment_intake", {
    p_intake: intakeId,
    p_attempt: attemptNo,
    p_record: record,
  });
  if (error || !data) throw new Error(error?.message ?? "Não foi possível aprovar a conferência.");
  return data;
}

/** Busca por número STI3 (identificador textual, já normalizado). Usada para evitar duplicidade. */
export async function findIntakeBySti3(sti3SaleId: string): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("fulfillment_intakes").select("id").eq("sti3_sale_id", sti3SaleId).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** CANCELAR VENDA: função atômica no banco (só antes da aprovação; invalida o link; log sem PII). */
export async function cancelIntakeRpc(input: { id: string; reason: string; note: string | null }): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_fulfillment_intake", {
    p_intake: input.id,
    p_reason: input.reason,
    p_note: input.note,
  });
  if (error) throw new Error(error.message);
}
