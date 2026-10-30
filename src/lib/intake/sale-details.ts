// EDITAR VENDA (pré-aprovação) — PURO. Decide o que pode ser salvo e se a
// conferência atual precisa ser invalidada. Nunca toca no banco.
import type { IntakeStatus } from "./status.ts";

export type IntakeSaleDetailsField = "sale_total" | "sale_date" | "seller_id";

/** Edição só antes de aprovada ou cancelada — depois disso o tratamento é outro (ver seção 5 do audit). */
export function canEditIntakeSaleDetails(status: IntakeStatus): boolean {
  return status !== "APPROVED" && status !== "CANCELLED";
}

export interface IntakeSaleDetailsCurrent {
  status: IntakeStatus;
  saleTotal: number;
  saleDate: string;
  sellerId: string | null;
  /** Existe pelo menos 1 linha em fulfillment_verification_attempts para esta intake. */
  hasAnyAttempt: boolean;
}

export interface IntakeSaleDetailsInput {
  saleTotal: number;
  saleDate: string;
  sellerId: string;
}

export type IntakeSaleDetailsPlan =
  | { ok: false; error: string }
  | {
      ok: true;
      changedFields: IntakeSaleDetailsField[];
      /**
       * `sale_total` mudou e já existe conferência: a tentativa mais recente foi calculada
       * com o valor ANTIGO e não pode mais aprovar nada. Nunca apaga/reescreve a tentativa —
       * só tira a intake de CHECKING/REVIEW_REQUIRED/BLOCKED, de volta para DOCUMENTS_PENDING,
       * que já bloqueia aprovação (canApproveIntake) e já permite reenviar o XML
       * (canUploadDocuments) — nenhum status novo, nenhuma migration.
       */
      forceDocumentsPending: boolean;
      update: { sale_total?: number; sale_date?: string; seller_id?: string };
    };

/**
 * Data e vendedora NUNCA entram em `ExpectedData`/na comparação do Confere Geral
 * (confirmado em conferir.ts/conferir-xml.ts) — corrigi-las não invalida nada.
 * Só o valor participa da conferência.
 */
export function planIntakeSaleDetailsUpdate(current: IntakeSaleDetailsCurrent, input: IntakeSaleDetailsInput): IntakeSaleDetailsPlan {
  if (!canEditIntakeSaleDetails(current.status)) {
    return { ok: false, error: "Esta venda já foi aprovada ou cancelada: não é mais possível editar por aqui." };
  }

  const changedFields: IntakeSaleDetailsField[] = [];
  if (input.saleTotal !== current.saleTotal) changedFields.push("sale_total");
  if (input.saleDate !== current.saleDate) changedFields.push("sale_date");
  if (input.sellerId !== current.sellerId) changedFields.push("seller_id");

  if (changedFields.length === 0) {
    return { ok: false, error: "Nenhuma alteração para salvar." };
  }

  const valueChanged = changedFields.includes("sale_total");
  const forceDocumentsPending = valueChanged && current.hasAnyAttempt;

  const update: { sale_total?: number; sale_date?: string; seller_id?: string } = {};
  if (changedFields.includes("sale_total")) update.sale_total = input.saleTotal;
  if (changedFields.includes("sale_date")) update.sale_date = input.saleDate;
  if (changedFields.includes("seller_id")) update.seller_id = input.sellerId;

  return { ok: true, changedFields, forceDocumentsPending, update };
}
