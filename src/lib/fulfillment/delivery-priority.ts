// Agilidade operacional da listagem de Faturamento e Envios: agrupamento e
// ordenação por urgência real. EM_ATRASO é SEMPRE calculado na leitura —
// nunca um valor novo de delivery_status, nunca gravado em lugar nenhum.
import type { DeliveryStatus } from "./delivery.ts";

const STORE_TIME_ZONE = "America/Campo_Grande";

/** Hoje (AAAA-MM-DD) no fuso da loja — mesmo fuso de STORE_TIME_ZONE em format.ts. */
export function todayIsoInStoreTimeZone(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: STORE_TIME_ZONE }).format(now);
}

export interface DeliveryPriorityInput {
  id: string;
  delivery_status: DeliveryStatus;
  tracking_code: string | null;
  expected_delivery_date: string | null;
}

/**
 * Regra exata (fechada, decidida pelo usuário) — nunca usar
 * requiresTrackingInfo() sozinho aqui: EM_ATRASO só existe quando o envio
 * JÁ SAIU (IN_TRANSIT, com rastreio) e a previsão já passou. PENDING com
 * previsão vencida continua "Aguardando envio" — ainda nem saiu, então não
 * é um atraso de entrega. RESENT e DELIVERY_ISSUE têm grupo próprio nesta
 * V1 e nunca entram aqui.
 */
export function isOverdue(record: DeliveryPriorityInput, todayIso: string): boolean {
  if (record.delivery_status !== "IN_TRANSIT") return false;
  if (!record.tracking_code?.trim()) return false;
  if (!record.expected_delivery_date) return false;
  return record.expected_delivery_date < todayIso;
}

export const DISPLAY_GROUPS = [
  "DELIVERY_ISSUE",
  "EM_ATRASO",
  "RESENT",
  "IN_TRANSIT",
  "PENDING",
  "DELIVERED",
  "REFUNDED",
  "UNKNOWN",
] as const;

export type DisplayGroup = (typeof DISPLAY_GROUPS)[number];

const GROUP_ORDER: Record<DisplayGroup, number> = Object.fromEntries(
  DISPLAY_GROUPS.map((group, index) => [group, index])
) as Record<DisplayGroup, number>;

export function displayGroupFor(record: DeliveryPriorityInput, todayIso: string): DisplayGroup {
  if (record.delivery_status === "DELIVERY_ISSUE") return "DELIVERY_ISSUE";
  if (isOverdue(record, todayIso)) return "EM_ATRASO";
  if (record.delivery_status === "RESENT") return "RESENT";
  if (record.delivery_status === "IN_TRANSIT") return "IN_TRANSIT";
  if (record.delivery_status === "PENDING") return "PENDING";
  if (record.delivery_status === "DELIVERED") return "DELIVERED";
  if (record.delivery_status === "REFUNDED") return "REFUNDED";
  return "UNKNOWN";
}

/**
 * Comparador único da listagem: grupo (ordem fixa acima) → regra de data do
 * grupo (mais antiga ou mais próxima primeiro) → sem previsão sempre por
 * último dentro do grupo → desempate por id (estável, nunca pula/repete
 * linha ao paginar).
 */
export function compareForListing(a: DeliveryPriorityInput, b: DeliveryPriorityInput, todayIso: string): number {
  const groupA = displayGroupFor(a, todayIso);
  const groupB = displayGroupFor(b, todayIso);
  if (groupA !== groupB) return GROUP_ORDER[groupA] - GROUP_ORDER[groupB];

  const dateA = a.expected_delivery_date;
  const dateB = b.expected_delivery_date;
  if (dateA !== dateB) {
    if (!dateA) return 1; // sem previsão vai pro fim do grupo
    if (!dateB) return -1;
    // Data menor primeiro nos dois casos: "mais antiga" (grupos OLDEST_FIRST_GROUPS,
    // mais atrasado primeiro) e "mais próxima" (demais grupos ativos) são a mesma
    // ordem ascendente — não há regra distinta pra aplicar aqui.
    return dateA < dateB ? -1 : 1;
  }

  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function sortRecordsForListing<T extends DeliveryPriorityInput>(records: T[], todayIso: string): T[] {
  return [...records].sort((a, b) => compareForListing(a, b, todayIso));
}
