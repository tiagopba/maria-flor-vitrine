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

/**
 * Vendedora conhecida → o nome dela. Sem vendedora mas com origem (ex: ONLINE)
 * → a origem. Nenhum dos dois → "Vendedora não informada" (nunca um cadastro fictício).
 */
export function formatSellerOrigin(sellerName: string | null | undefined, origin: string | null | undefined): string {
  if (sellerName) return sellerName;
  if (origin) return origin;
  return UNKNOWN_SELLER_LABEL;
}
