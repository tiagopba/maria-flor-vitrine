// Edição administrativa (Admin/Master) de uma solicitação de pré-faturamento — PURO.
// A persistência em si (UPDATE + invalidação de conferência + audit log + histórico
// privado) é ATÔMICA e vive na função SECURITY DEFINER `edit_fulfillment_intake`
// (supabase/migrations/20261016100000_fulfillment_intake_admin_edit.sql) — não numa
// sequência de chamadas deste Server Action. Este módulo só tem a validação de
// motivo (reaproveitada na mensagem de erro do cliente, antes de bater no banco;
// o banco valida de novo, é quem decide de verdade) e a lista de referência dos
// campos que participam da conferência, usada só para manter os dois lados em
// sincronia (ver teste de paridade com o texto da migration).
export const EDIT_REASONS = ["SALE_TYPO", "CUSTOMER_REQUESTED_CORRECTION", "NFE_ISSUANCE_CORRECTION", "OTHER"] as const;
export type EditReason = (typeof EDIT_REASONS)[number];

export const EDIT_REASON_LABELS: Record<EditReason, string> = {
  SALE_TYPO: "Erro de digitação da venda",
  CUSTOMER_REQUESTED_CORRECTION: "Correção solicitada pela cliente",
  NFE_ISSUANCE_CORRECTION: "Correção para emissão da NF-e",
  OTHER: "Outro",
};

export const EDIT_NOTE_MAX = 280;

export function isEditReason(value: unknown): value is EditReason {
  return typeof value === "string" && (EDIT_REASONS as readonly string[]).includes(value);
}

export type EditReasonInputResult =
  | { ok: true; reason: EditReason; note: string | null }
  | { ok: false; fieldErrors: Partial<Record<"reason" | "note", string>> };

/**
 * "Outro" exige observação curta (até 280 caracteres) — guardada no histórico
 * privado de edição (`fulfillment_intake_edit_history.reason_note`), NUNCA no
 * audit log genérico. Os demais motivos não aceitam texto (`note: null`).
 */
export function validateEditReasonInput(input: { reason: unknown; note: unknown }): EditReasonInputResult {
  if (!isEditReason(input.reason)) {
    return { ok: false, fieldErrors: { reason: "Escolha o motivo da correção." } };
  }
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (input.reason === "OTHER") {
    if (note.length === 0) return { ok: false, fieldErrors: { note: "Explique o motivo em uma frase curta." } };
    if (note.length > EDIT_NOTE_MAX) return { ok: false, fieldErrors: { note: `Use no máximo ${EDIT_NOTE_MAX} caracteres.` } };
    return { ok: true, reason: "OTHER", note };
  }
  return { ok: true, reason: input.reason, note: null };
}

/**
 * Colunas de `fulfillment_intakes` que participam da comparação com o XML da NF-e
 * (ver conferirXml em conferir-xml.ts): nome, CPF, endereço, destinatário e valor.
 * STI3, vendedora, data da venda, forma de pagamento, observação interna, e-mail e
 * WhatsApp não entram na comparação — editá-los nunca invalida uma conferência.
 * Referência só para teste de paridade: quem decide de verdade é a função SQL
 * (`v_conference_affected := true`, mesmas colunas) — ver edit-rpc-migration.test.ts.
 */
export const CONFERENCE_AFFECTING_COLUMNS = [
  "submitted_name",
  "submitted_cpf",
  "submitted_postal_code",
  "submitted_address_line",
  "submitted_address_number",
  "submitted_address_complement",
  "submitted_neighborhood",
  "submitted_city",
  "submitted_state",
  "submitted_delivery_to_customer",
  "submitted_recipient_name",
  "sale_total",
] as const;

export function conferenceAffectedByEdit(changedColumns: readonly string[]): boolean {
  return changedColumns.some((c) => (CONFERENCE_AFFECTING_COLUMNS as readonly string[]).includes(c));
}
