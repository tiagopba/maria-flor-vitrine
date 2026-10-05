// Situação LOGÍSTICA do envio — separada de `status` (que é só "registro confirmado").

export const DELIVERY_STATUSES = [
  "PENDING",
  "IN_TRANSIT",
  "DELIVERED",
  "RESENT",
  "REFUNDED",
  "DELIVERY_ISSUE",
] as const;

export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

export const DEFAULT_DELIVERY_STATUS: DeliveryStatus = "PENDING";

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: "Aguardando envio",
  IN_TRANSIT: "Em trânsito",
  DELIVERED: "Entregue",
  RESENT: "Reenviado",
  REFUNDED: "Estornado",
  DELIVERY_ISSUE: "Problema na entrega",
};

export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return typeof value === "string" && (DELIVERY_STATUSES as readonly string[]).includes(value);
}

export const UNKNOWN_SELLER_LABEL = "Vendedora não informada";

/** "ONLINE" → "Online" · "TRAY" → "Tray" (no banco a origem fica sempre em caixa alta). */
export function formatOriginLabel(origin: string): string {
  const lower = origin.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

/**
 * Vendedora e origem são informações independentes: uma nunca substitui a outra.
 * Sem vendedora → "Vendedora não informada" (nunca um cadastro fictício); a origem,
 * quando existe, aparece sempre numa segunda linha ("Origem: Online").
 */
export function describeSellerOrigin(
  sellerName: string | null | undefined,
  origin: string | null | undefined
): { primary: string; secondary: string | null } {
  return {
    primary: sellerName || UNKNOWN_SELLER_LABEL,
    secondary: origin ? `Origem: ${formatOriginLabel(origin)}` : null,
  };
}
