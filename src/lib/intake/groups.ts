// Seções da listagem do Pré-faturamento — PURO.
// Cada solicitação aparece em UMA seção. Canceladas só aparecem em "Canceladas".
import type { IntakeStatus } from "./status.ts";

export interface IntakeGroup {
  key: string;
  title: string;
  statuses: IntakeStatus[];
}

export const INTAKE_GROUPS: readonly IntakeGroup[] = [
  { key: "awaiting", title: "Aguardando dados", statuses: ["AWAITING_CUSTOMER_DATA"] },
  { key: "received", title: "Dados recebidos", statuses: ["DATA_RECEIVED", "DOCUMENTS_PENDING"] },
  { key: "blocked", title: "Conferência bloqueada", statuses: ["BLOCKED"] },
  { key: "review", title: "Revisar", statuses: ["CHECKING", "REVIEW_REQUIRED"] },
  { key: "approved", title: "Prontos / conferidos", statuses: ["APPROVED"] },
  { key: "cancelled", title: "Canceladas", statuses: ["CANCELLED"] },
];

/** Devolve, para cada seção, as linhas cujo status pertence a ela. Nenhuma linha aparece em duas seções. */
export function groupIntakeRows<T extends { status: string }>(rows: readonly T[]): { group: IntakeGroup; items: T[] }[] {
  return INTAKE_GROUPS.map((group) => ({
    group,
    items: rows.filter((r) => (group.statuses as readonly string[]).includes(r.status)),
  }));
}
