// Indicadores do topo da listagem de Faturamento e Envios (Fase 4) — PUROS,
// recebem o grupo/estado já calculados (displayGroupFor, reviewRowState) e só
// contam. Nenhuma consulta ao banco aqui.
import type { DisplayGroup } from "./delivery-priority.ts";
import type { ReviewRowState } from "./customer-review.ts";

export interface IndicatorRow {
  customerId: string | null;
  group: DisplayGroup;
  /** null = dado de avaliação indisponível (migration da Fase 3 ainda não aplicada neste banco). */
  reviewState: ReviewRowState | null;
}

export interface FulfillmentIndicators {
  overdueDeliveries: number;
  postSalePending: number;
  reviewsEligible: number;
  customersReviewed: number;
}

/**
 * Sempre sobre o conjunto já filtrado pelos filtros avançados (busca, datas,
 * vendedora, origem, transportadora, status, UF, follow-up) — nunca afetado
 * pelo chip de situação ou pelo toggle "Mostrar entregues concluídas"
 * (senão cada indicador desapareceria ao abrir a própria aba que ele resume).
 * Nunca conta a mesma cliente duas vezes: "elegíveis" e "já avaliaram" usam
 * Set por customerId. Vendas sem CPF confiável (customerId null) contam por
 * venda, já que não têm identidade de cliente para deduplicar contra.
 */
export function computeFulfillmentIndicators(rows: readonly IndicatorRow[]): FulfillmentIndicators {
  let overdueDeliveries = 0;
  let postSalePending = 0;
  const eligibleCustomers = new Set<string>();
  let eligibleStandalone = 0;
  const reviewedCustomers = new Set<string>();

  for (const row of rows) {
    if (row.group === "EM_ATRASO") overdueDeliveries++;
    if (row.group === "POST_SALE_PENDING") postSalePending++;

    if (row.reviewState === "AVAILABLE") {
      if (row.customerId) eligibleCustomers.add(row.customerId);
      else eligibleStandalone++;
    }
    if (row.reviewState === "REVIEWED" && row.customerId) {
      reviewedCustomers.add(row.customerId);
    }
  }

  return {
    overdueDeliveries,
    postSalePending,
    reviewsEligible: eligibleCustomers.size + eligibleStandalone,
    customersReviewed: reviewedCustomers.size,
  };
}
