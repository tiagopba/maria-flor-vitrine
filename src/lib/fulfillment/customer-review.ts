// Avaliação Google — estado GLOBAL da cliente (por customer_id), separado do
// follow-up por VENDA (fulfillment_followups, inalterado). Ver
// supabase/migrations/20261116110000_fulfillment_customer_review_status.sql
// e 20261116120000_fulfillment_customer_review_backend.sql.
//
// REVIEWED e DOES_NOT_WANT só saem de uma ação humana explícita
// (set_customer_review_outcome) — nunca automático, nunca inferido de um
// follow-up SENT (SENT só prova que a loja confirmou TER PEDIDO, nunca que a
// cliente respondeu).

export const CUSTOMER_REVIEW_STATUSES = ["NEVER_ASKED", "REQUESTED", "REVIEWED", "DISMISSED", "DOES_NOT_WANT"] as const;
export type CustomerReviewStatus = (typeof CUSTOMER_REVIEW_STATUSES)[number];

export function isCustomerReviewStatus(value: unknown): value is CustomerReviewStatus {
  return typeof value === "string" && (CUSTOMER_REVIEW_STATUSES as readonly string[]).includes(value);
}

export const CUSTOMER_REVIEW_STATUS_LABELS: Record<CustomerReviewStatus, string> = {
  NEVER_ASKED: "Nunca solicitada",
  REQUESTED: "Avaliação solicitada",
  REVIEWED: "Avaliação realizada",
  DISMISSED: "Dispensada",
  DOES_NOT_WANT: "Cliente não deseja receber",
};

/** Estados que bloqueiam permanentemente um novo pedido automático — nunca reabrem sozinhos. */
const PERMANENTLY_BLOCKED: readonly CustomerReviewStatus[] = ["REVIEWED", "DOES_NOT_WANT"];
/** REQUESTED também bloqueia, mas é reversível (vira REVIEWED/DISMISSED/DOES_NOT_WANT por ação humana). */
const BLOCKED_FOR_NEW_REQUEST: readonly CustomerReviewStatus[] = ["REQUESTED", ...PERMANENTLY_BLOCKED];

export interface ReviewEligibility {
  eligible: boolean;
  /** null quando eligible=true. Nunca usado pra decidir nada sozinho — só para exibição. */
  reason: string | null;
}

/**
 * Decide se uma NOVA solicitação de avaliação pode ser sugerida/permitida
 * pra esta cliente — nunca pela venda isolada. `status` null = cliente sem
 * customer_id (sem CPF confiável): segue elegível, comportamento igual ao
 * que já existia antes deste módulo (sem histórico global pra consultar).
 *
 * Espelha a MESMA regra que confirm_google_review_sent já aplica no banco
 * (fonte da verdade) — esta função é só pra Fase 4 poder mostrar o motivo
 * sem precisar tentar a ação primeiro. Nunca é, sozinha, a autorização real.
 */
export function reviewEligibility(status: CustomerReviewStatus | null): ReviewEligibility {
  if (status === null) return { eligible: true, reason: null };
  if (!BLOCKED_FOR_NEW_REQUEST.includes(status)) return { eligible: true, reason: null };

  const reason =
    status === "REVIEWED"
      ? "Esta cliente já avaliou a Maria Flor."
      : status === "DOES_NOT_WANT"
        ? "Esta cliente pediu para não receber mais pedidos de avaliação."
        : "Já existe uma solicitação de avaliação em aberto para esta cliente.";
  return { eligible: false, reason };
}

// ── Situação de avaliação por VENDA (Fase 4 — coluna "Situação da avaliação") ──
// Combina o follow-up GOOGLE_REVIEW desta venda (OPEN/SENT) com o estado
// GLOBAL da cliente — nunca o follow-up isolado. Resolve exatamente o pedido
// "não apresentar avaliação bloqueada como pendência aberta, mesmo quando
// existir um GOOGLE_REVIEW antigo com status OPEN".

export const REVIEW_ROW_STATES = ["AVAILABLE", "REQUESTED", "REVIEWED", "DOES_NOT_WANT", "DISMISSED"] as const;
export type ReviewRowState = (typeof REVIEW_ROW_STATES)[number];

export const REVIEW_ROW_STATE_LABELS: Record<ReviewRowState, string> = {
  AVAILABLE: "Avaliação disponível",
  REQUESTED: "Avaliação já solicitada",
  REVIEWED: "Cliente já avaliou",
  DOES_NOT_WANT: "Cliente não deseja avaliar",
  DISMISSED: "Avaliação dispensada",
};

/**
 * `globalStatus` null = sem customer_id (sem CPF confiável) OU backend da
 * Fase 3 ainda não aplicado neste banco — cai no comportamento de antes
 * deste módulo (só o follow-up da própria venda decide: OPEN → disponível,
 * SENT → já solicitada). REQUESTED/REVIEWED/DOES_NOT_WANT sempre vencem um
 * followupStatus OPEN desta venda: um pedido feito numa venda anterior da
 * MESMA cliente bloqueia o GOOGLE_REVIEW em aberto de uma venda nova.
 */
export function reviewRowState(followupStatus: "OPEN" | "SENT", globalStatus: CustomerReviewStatus | null): ReviewRowState {
  if (globalStatus === "REVIEWED") return "REVIEWED";
  if (globalStatus === "DOES_NOT_WANT") return "DOES_NOT_WANT";
  if (globalStatus === "REQUESTED") return "REQUESTED";
  if (followupStatus === "SENT") return "REQUESTED";
  if (globalStatus === "DISMISSED") return "DISMISSED";
  return "AVAILABLE";
}
