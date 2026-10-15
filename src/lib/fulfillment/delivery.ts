// Situação LOGÍSTICA do envio — separada de `status` (que é só "registro confirmado").

/** Status oferecidos no fluxo normal (cadastro por PDF e atualização de situação). */
export const DELIVERY_STATUSES = [
  "PENDING",
  "IN_TRANSIT",
  "DELIVERED",
  "RESENT",
  "REFUNDED",
  "DELIVERY_ISSUE",
] as const;

/**
 * UNKNOWN ("Situação não informada") existe SÓ para registro histórico cuja
 * planilha antiga não diz nada sobre entrega — o banco recusa UNKNOWN fora de
 * HISTORICAL_IMPORT. Nunca usar PENDING para isso ("Aguardando envio").
 */
export const ALL_DELIVERY_STATUSES = [...DELIVERY_STATUSES, "UNKNOWN"] as const;

export type DeliveryStatus = (typeof ALL_DELIVERY_STATUSES)[number];

export type RecordSource = "PDF_UPLOAD" | "HISTORICAL_IMPORT" | "XML_UPLOAD";

/** Status que um registro daquela origem pode escolher na tela (UNKNOWN só no histórico). */
export function statusesForSource(source: RecordSource): readonly DeliveryStatus[] {
  return source === "HISTORICAL_IMPORT" ? ALL_DELIVERY_STATUSES : DELIVERY_STATUSES;
}

export const DEFAULT_DELIVERY_STATUS: DeliveryStatus = "PENDING";

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  PENDING: "Aguardando envio",
  IN_TRANSIT: "Em trânsito",
  DELIVERED: "Entregue",
  RESENT: "Reenviado",
  REFUNDED: "Estornado",
  DELIVERY_ISSUE: "Problema na entrega",
  UNKNOWN: "Situação não informada",
};

/** Qualquer status válido do banco (inclui UNKNOWN) — usado em filtros e leitura. */
export function isDeliveryStatus(value: unknown): value is DeliveryStatus {
  return typeof value === "string" && (ALL_DELIVERY_STATUSES as readonly string[]).includes(value);
}

/** Status permitidos num cadastro NORMAL (por PDF): nunca UNKNOWN. */
export function isFormDeliveryStatus(value: unknown): value is (typeof DELIVERY_STATUSES)[number] {
  return typeof value === "string" && (DELIVERY_STATUSES as readonly string[]).includes(value);
}

/**
 * Status "operacionalmente encerrados": a venda não vai mais precisar de rastreio
 * novo, então um registro nesses status nunca bloqueia Nova Venda mesmo sem
 * tracking_code. DELIVERED: já chegou, o que aconteceu já aconteceu. REFUNDED:
 * venda estornada, não há mais envio a rastrear. UNKNOWN: só existe em
 * HISTORICAL_IMPORT, fora do fluxo operacional ativo que esta regra protege.
 */
const TRACKING_NOT_REQUIRED_STATUSES: readonly DeliveryStatus[] = ["DELIVERED", "REFUNDED", "UNKNOWN"];

export function requiresTrackingInfo(status: DeliveryStatus): boolean {
  return !TRACKING_NOT_REQUIRED_STATUSES.includes(status);
}

/** Rastreamento pendente: status ainda ativo e sem código de rastreio (nulo ou só espaço). */
export function isPendingTracking(trackingCode: string | null, deliveryStatus: DeliveryStatus): boolean {
  return requiresTrackingInfo(deliveryStatus) && !trackingCode?.trim();
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
