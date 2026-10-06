// Forma de pagamento da venda — PURO. Nunca guarda dado de cartão, CVV ou conta.
// Nova solicitação: só as 4 formas abaixo (código estável interno + nome exibido).
// Códigos genéricos antigos ficam apenas para exibir registros já existentes.

export const PAYMENT_METHODS = ["ITAU_CREDIT_ELO_AMEX", "ITAU_CREDIT_MASTER", "ITAU_CREDIT_VISA", "ITAU_PIX"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  ITAU_CREDIT_ELO_AMEX: "ITAÚ CRÉDITO ELO/AMEX",
  ITAU_CREDIT_MASTER: "ITAÚ CRÉDITO MASTER",
  ITAU_CREDIT_VISA: "ITAÚ CRÉDITO VISA",
  ITAU_PIX: "ITAÚ PIX",
};

/** Códigos antigos (registros existentes). Não aceitos em nova solicitação. */
export const LEGACY_PAYMENT_LABELS: Record<string, string> = {
  PIX: "Pix",
  CASH: "Dinheiro",
  DEBIT_CARD: "Cartão de débito",
  CREDIT_CARD: "Cartão de crédito",
  CDC: "CDC",
  OTHER: "Outro",
};

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Nome exibido para qualquer código (novo ou legado). */
export function formatPayment(method: string | null | undefined): string {
  if (!method) return "—";
  return PAYMENT_LABELS[method as PaymentMethod] ?? LEGACY_PAYMENT_LABELS[method] ?? method;
}
