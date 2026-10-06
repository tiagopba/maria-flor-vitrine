// Cancelamento de solicitação de pré-faturamento — PURO.
// O log de auditoria guarda só o código do motivo. O texto livre (OTHER) fica só no registro privado.

export const CANCEL_REASONS = ["CUSTOMER_WITHDREW", "CANCELLED_IN_STI3", "CREATED_BY_MISTAKE", "OTHER"] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export const CANCEL_REASON_LABELS: Record<CancelReason, string> = {
  CUSTOMER_WITHDREW: "Cliente desistiu da compra",
  CANCELLED_IN_STI3: "Venda cancelada no STI3",
  CREATED_BY_MISTAKE: "Cadastro criado por engano",
  OTHER: "Outro",
};

export const CANCEL_NOTE_MAX = 280;

export function isCancelReason(value: unknown): value is CancelReason {
  return typeof value === "string" && (CANCEL_REASONS as readonly string[]).includes(value);
}

export type CancelInputResult =
  | { ok: true; reason: CancelReason; note: string | null }
  | { ok: false; fieldErrors: Partial<Record<"reason" | "note", string>> };

/** Valida o motivo no servidor. "Outro" exige observação curta; os demais não aceitam texto. */
export function validateCancelInput(input: { reason: unknown; note: unknown }): CancelInputResult {
  if (!isCancelReason(input.reason)) {
    return { ok: false, fieldErrors: { reason: "Escolha o motivo do cancelamento." } };
  }
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (input.reason === "OTHER") {
    if (note.length === 0) return { ok: false, fieldErrors: { note: "Explique o motivo em uma frase curta." } };
    if (note.length > CANCEL_NOTE_MAX) {
      return { ok: false, fieldErrors: { note: `Use no máximo ${CANCEL_NOTE_MAX} caracteres.` } };
    }
    return { ok: true, reason: input.reason, note };
  }
  return { ok: true, reason: input.reason, note: null };
}
