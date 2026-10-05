// Status do PRÉ-FATURAMENTO — separado de delivery_status. PURO.

export const INTAKE_STATUSES = [
  "AWAITING_CUSTOMER_DATA",
  "DATA_RECEIVED",
  "DOCUMENTS_PENDING",
  "CHECKING",
  "REVIEW_REQUIRED",
  "BLOCKED",
  "APPROVED",
] as const;
export type IntakeStatus = (typeof INTAKE_STATUSES)[number];

export const INTAKE_STATUS_LABELS: Record<IntakeStatus, string> = {
  AWAITING_CUSTOMER_DATA: "Aguardando dados",
  DATA_RECEIVED: "Dados recebidos",
  DOCUMENTS_PENDING: "Aguardando DANFE e etiqueta",
  CHECKING: "Conferindo",
  REVIEW_REQUIRED: "Revisar",
  BLOCKED: "Conferência bloqueada",
  APPROVED: "Conferência aprovada",
};

export function isIntakeStatus(value: unknown): value is IntakeStatus {
  return typeof value === "string" && (INTAKE_STATUSES as readonly string[]).includes(value);
}

/** A cliente só pode enviar enquanto aguarda os dados (e não depois de enviar). */
export function canCustomerSubmit(status: IntakeStatus, expired: boolean): boolean {
  return status === "AWAITING_CUSTOMER_DATA" && !expired;
}

/** Admin/Master pode reabrir a coleta em qualquer estado, exceto depois de aprovada. */
export function canReopenCollection(status: IntakeStatus): boolean {
  return status !== "APPROVED";
}

/** Os documentos só podem ser enviados para a conferência depois que a cliente enviou os dados. */
export function canUploadDocuments(status: IntakeStatus): boolean {
  return status === "DATA_RECEIVED" || status === "DOCUMENTS_PENDING" || status === "BLOCKED" || status === "REVIEW_REQUIRED";
}
