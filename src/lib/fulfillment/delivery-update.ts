import type { DeliveryStatus, RecordSource } from "./delivery.ts";
import { formatIsoDate } from "./format.ts";
import type { DeliveryUpdateInput } from "./schema.ts";

/** Os únicos campos que "Atualizar situação" pode mexer (nomes de coluna — também o que vai para a auditoria). */
export const DELIVERY_UPDATE_TRACKED_FIELDS = [
  "delivery_status",
  "expected_delivery_date",
  "delivered_at",
  "notes",
  "carrier",
  "shipping_service",
  "tracking_code",
] as const;

export type DeliveryUpdateField = (typeof DELIVERY_UPDATE_TRACKED_FIELDS)[number];

export interface DeliveryState {
  delivery_status: DeliveryStatus;
  expected_delivery_date: string | null;
  delivered_at: string | null;
  notes: string | null;
  carrier: string | null;
  shipping_service: string | null;
  tracking_code: string | null;
}

export type DeliveryUpdatePlan =
  | {
      ok: true;
      update: DeliveryState;
      /** Só NOMES de campos — nunca valores (observações podem conter dado pessoal). */
      changedFields: DeliveryUpdateField[];
      previousStatus: DeliveryStatus;
      newStatus: DeliveryStatus;
    }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

/**
 * Compara o estado atual (lido do banco, nunca confiado do navegador) com o
 * que foi enviado e decide o que gravar. Regras:
 * - sair de ENTREGUE com data de entrega registrada exige confirmação explícita
 *   (a data é removida, nunca deixada incoerente);
 * - sem nenhuma alteração, não grava nem audita.
 */
export function planDeliveryUpdate(
  current: DeliveryState,
  input: DeliveryUpdateInput,
  recordSource: RecordSource = "PDF_UPLOAD"
): DeliveryUpdatePlan {
  const update: DeliveryState = {
    delivery_status: input.delivery_status,
    expected_delivery_date: input.expected_delivery_date,
    delivered_at: input.delivered_at,
    notes: input.notes,
    carrier: input.carrier,
    shipping_service: input.shipping_service,
    tracking_code: input.tracking_code,
  };

  // UNKNOWN ("Situação não informada") só existe em registro histórico (o banco também recusa).
  if (update.delivery_status === "UNKNOWN" && recordSource !== "HISTORICAL_IMPORT") {
    const message = "Situação não informada só vale para registros históricos.";
    return { ok: false, error: message, fieldErrors: { deliveryStatus: message } };
  }

  const leavingDelivered =
    current.delivery_status === "DELIVERED" && Boolean(current.delivered_at) && update.delivery_status !== "DELIVERED";
  if (leavingDelivered && !input.confirmClearDelivery) {
    const message = `Este registro está como Entregue em ${formatIsoDate(current.delivered_at)}. Confirme a remoção da data de entrega para mudar o status.`;
    return { ok: false, error: message, fieldErrors: { confirmClearDelivery: message } };
  }

  const changedFields = DELIVERY_UPDATE_TRACKED_FIELDS.filter((field) => current[field] !== update[field]);
  if (changedFields.length === 0) {
    return { ok: false, error: "Nenhuma alteração para salvar.", fieldErrors: {} };
  }

  return {
    ok: true,
    update,
    changedFields,
    previousStatus: current.delivery_status,
    newStatus: update.delivery_status,
  };
}
