import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeFulfillmentIndicators, type IndicatorRow } from "../listing-indicators.ts";

function row(overrides: Partial<IndicatorRow>): IndicatorRow {
  return { customerId: null, group: "PENDING", reviewState: null, ...overrides };
}

describe("computeFulfillmentIndicators", () => {
  it("conta EM_ATRASO e POST_SALE_PENDING por venda (nunca deduplicado — cada venda é sua própria entrega)", () => {
    const result = computeFulfillmentIndicators([
      row({ group: "EM_ATRASO" }),
      row({ group: "EM_ATRASO" }),
      row({ group: "POST_SALE_PENDING" }),
      row({ group: "DELIVERED" }),
    ]);
    assert.equal(result.overdueDeliveries, 2);
    assert.equal(result.postSalePending, 1);
  });

  it("'elegíveis' e 'já avaliaram' deduplicam por customerId — a mesma cliente com 3 vendas conta 1 vez", () => {
    const result = computeFulfillmentIndicators([
      row({ customerId: "c1", group: "PENDING", reviewState: "AVAILABLE" }),
      row({ customerId: "c1", group: "DELIVERED", reviewState: "AVAILABLE" }),
      row({ customerId: "c1", group: "DELIVERED", reviewState: "AVAILABLE" }),
      row({ customerId: "c2", group: "DELIVERED", reviewState: "REVIEWED" }),
      row({ customerId: "c2", group: "DELIVERED", reviewState: "REVIEWED" }),
    ]);
    assert.equal(result.reviewsEligible, 1);
    assert.equal(result.customersReviewed, 1);
  });

  it("venda sem customer_id (sem CPF confiável) conta por venda, nunca deduplicada", () => {
    const result = computeFulfillmentIndicators([
      row({ customerId: null, group: "PENDING", reviewState: "AVAILABLE" }),
      row({ customerId: null, group: "PENDING", reviewState: "AVAILABLE" }),
    ]);
    assert.equal(result.reviewsEligible, 2);
  });

  it("REQUESTED/DOES_NOT_WANT/DISMISSED nunca contam como elegível nem como já avaliou", () => {
    const result = computeFulfillmentIndicators([
      row({ customerId: "c1", reviewState: "REQUESTED" }),
      row({ customerId: "c2", reviewState: "DOES_NOT_WANT" }),
      row({ customerId: "c3", reviewState: "DISMISSED" }),
    ]);
    assert.equal(result.reviewsEligible, 0);
    assert.equal(result.customersReviewed, 0);
  });

  it("reviewState null (migration da Fase 3 não aplicada) nunca entra em nenhuma contagem de avaliação", () => {
    const result = computeFulfillmentIndicators([row({ customerId: "c1", reviewState: null })]);
    assert.equal(result.reviewsEligible, 0);
    assert.equal(result.customersReviewed, 0);
  });

  it("conjunto vazio — tudo zero", () => {
    const result = computeFulfillmentIndicators([]);
    assert.deepEqual(result, { overdueDeliveries: 0, postSalePending: 0, reviewsEligible: 0, customersReviewed: 0 });
  });
});
