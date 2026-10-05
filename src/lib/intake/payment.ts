// Forma de pagamento da venda — PURO. Nunca guarda dado de cartão, CVV ou conta.

export const PAYMENT_METHODS = ["PIX", "CASH", "DEBIT_CARD", "CREDIT_CARD", "CDC", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  PIX: "Pix",
  CASH: "Dinheiro",
  DEBIT_CARD: "Cartão de débito",
  CREDIT_CARD: "Cartão de crédito",
  CDC: "CDC",
  OTHER: "Outro",
};

export const MAX_INSTALLMENTS = 12;

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Parcelas só para cartão de crédito (1 a 12). Qualquer outro método não tem parcelas. */
export function validateInstallments(
  method: PaymentMethod,
  installments: number | null
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (method !== "CREDIT_CARD") return { ok: true, value: null };
  if (installments === null || !Number.isInteger(installments)) {
    return { ok: false, error: "Informe a quantidade de parcelas." };
  }
  if (installments < 1 || installments > MAX_INSTALLMENTS) {
    return { ok: false, error: `Parcelas entre 1 e ${MAX_INSTALLMENTS}.` };
  }
  return { ok: true, value: installments };
}

/** "Pix" · "Cartão de crédito · 3x". Para exibição interna apenas. */
export function formatPayment(method: PaymentMethod | null, installments: number | null): string {
  if (!method) return "—";
  if (method === "CREDIT_CARD" && installments) return `${PAYMENT_LABELS[method]} · ${installments}x`;
  return PAYMENT_LABELS[method];
}
