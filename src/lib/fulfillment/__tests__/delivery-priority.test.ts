import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  compareForListing,
  displayGroupFor,
  isOverdue,
  sortRecordsForListing,
  todayIsoInStoreTimeZone,
  type DeliveryPriorityInput,
} from "../delivery-priority.ts";

const TODAY = "2026-10-16";
const YESTERDAY = "2026-10-15";
const TOMORROW = "2026-10-17";

function record(overrides: Partial<DeliveryPriorityInput> & { id: string }): DeliveryPriorityInput {
  return {
    delivery_status: "PENDING",
    tracking_code: null,
    expected_delivery_date: null,
    ...overrides,
  };
}

describe("isOverdue / EM_ATRASO — regra exata (não usa requiresTrackingInfo)", () => {
  it("IN_TRANSIT + rastreio + previsão ontem → EM_ATRASO", () => {
    const r = record({ id: "1", delivery_status: "IN_TRANSIT", tracking_code: "AB123", expected_delivery_date: YESTERDAY });
    assert.equal(isOverdue(r, TODAY), true);
    assert.equal(displayGroupFor(r, TODAY), "EM_ATRASO");
  });

  it("IN_TRANSIT SEM rastreio + previsão ontem → continua IN_TRANSIT (não é EM_ATRASO)", () => {
    const r = record({ id: "2", delivery_status: "IN_TRANSIT", tracking_code: null, expected_delivery_date: YESTERDAY });
    assert.equal(isOverdue(r, TODAY), false);
    assert.equal(displayGroupFor(r, TODAY), "IN_TRANSIT");
  });

  it("IN_TRANSIT + rastreio só espaço em branco + previsão ontem → não é EM_ATRASO", () => {
    const r = record({ id: "2b", delivery_status: "IN_TRANSIT", tracking_code: "   ", expected_delivery_date: YESTERDAY });
    assert.equal(isOverdue(r, TODAY), false);
  });

  it("PENDING + previsão ontem → continua PENDING/Aguardando envio, NUNCA EM_ATRASO", () => {
    const r = record({ id: "3", delivery_status: "PENDING", expected_delivery_date: YESTERDAY });
    assert.equal(isOverdue(r, TODAY), false);
    assert.equal(displayGroupFor(r, TODAY), "PENDING");
  });

  it("RESENT + previsão ontem → continua RESENT, nunca EM_ATRASO nesta V1", () => {
    const r = record({ id: "4", delivery_status: "RESENT", tracking_code: "AB123", expected_delivery_date: YESTERDAY });
    assert.equal(displayGroupFor(r, TODAY), "RESENT");
  });

  it("DELIVERY_ISSUE + previsão ontem → continua DELIVERY_ISSUE, nunca EM_ATRASO", () => {
    const r = record({ id: "5", delivery_status: "DELIVERY_ISSUE", tracking_code: "AB123", expected_delivery_date: YESTERDAY });
    assert.equal(displayGroupFor(r, TODAY), "DELIVERY_ISSUE");
  });

  it("DELIVERED + previsão ontem → continua DELIVERED, nunca EM_ATRASO", () => {
    const r = record({ id: "6", delivery_status: "DELIVERED", tracking_code: "AB123", expected_delivery_date: YESTERDAY });
    assert.equal(displayGroupFor(r, TODAY), "DELIVERED");
  });

  it("REFUNDED e UNKNOWN nunca entram em EM_ATRASO mesmo com previsão vencida", () => {
    assert.equal(displayGroupFor(record({ id: "7", delivery_status: "REFUNDED", expected_delivery_date: YESTERDAY }), TODAY), "REFUNDED");
    assert.equal(displayGroupFor(record({ id: "8", delivery_status: "UNKNOWN", expected_delivery_date: YESTERDAY }), TODAY), "UNKNOWN");
  });

  it("IN_TRANSIT + rastreio + previsão é HOJE → ainda não está atrasado (só < hoje conta)", () => {
    const r = record({ id: "9", delivery_status: "IN_TRANSIT", tracking_code: "AB123", expected_delivery_date: TODAY });
    assert.equal(isOverdue(r, TODAY), false);
  });

  it("IN_TRANSIT + rastreio + sem expected_delivery_date → nunca EM_ATRASO (sem previsão não dá pra saber se atrasou)", () => {
    const r = record({ id: "10", delivery_status: "IN_TRANSIT", tracking_code: "AB123", expected_delivery_date: null });
    assert.equal(isOverdue(r, TODAY), false);
    assert.equal(displayGroupFor(r, TODAY), "IN_TRANSIT");
  });
});

describe("ordenação da listagem — 8 grupos, previsão dentro do grupo, desempate por id", () => {
  it("ordem dos grupos: DELIVERY_ISSUE, EM_ATRASO, RESENT, IN_TRANSIT, PENDING, DELIVERED, REFUNDED, UNKNOWN", () => {
    const records: DeliveryPriorityInput[] = [
      record({ id: "unknown", delivery_status: "UNKNOWN" }),
      record({ id: "refunded", delivery_status: "REFUNDED" }),
      record({ id: "delivered", delivery_status: "DELIVERED" }),
      record({ id: "pending", delivery_status: "PENDING" }),
      record({ id: "in_transit", delivery_status: "IN_TRANSIT" }),
      record({ id: "resent", delivery_status: "RESENT" }),
      record({ id: "em_atraso", delivery_status: "IN_TRANSIT", tracking_code: "X", expected_delivery_date: YESTERDAY }),
      record({ id: "delivery_issue", delivery_status: "DELIVERY_ISSUE" }),
    ];
    const sorted = sortRecordsForListing(records, TODAY).map((r) => r.id);
    assert.deepEqual(sorted, [
      "delivery_issue",
      "em_atraso",
      "resent",
      "in_transit",
      "pending",
      "delivered",
      "refunded",
      "unknown",
    ]);
  });

  it("dentro de EM_ATRASO/DELIVERY_ISSUE: previsão mais antiga primeiro", () => {
    const older = record({ id: "older", delivery_status: "IN_TRANSIT", tracking_code: "X", expected_delivery_date: "2026-10-01" });
    const newer = record({ id: "newer", delivery_status: "IN_TRANSIT", tracking_code: "X", expected_delivery_date: YESTERDAY });
    const sorted = sortRecordsForListing([newer, older], TODAY).map((r) => r.id);
    assert.deepEqual(sorted, ["older", "newer"]);
  });

  it("dentro de IN_TRANSIT/PENDING/RESENT (ativos, não atrasados): previsão mais próxima primeiro", () => {
    const far = record({ id: "far", delivery_status: "PENDING", expected_delivery_date: "2026-11-01" });
    const near = record({ id: "near", delivery_status: "PENDING", expected_delivery_date: TOMORROW });
    const sorted = sortRecordsForListing([far, near], TODAY).map((r) => r.id);
    assert.deepEqual(sorted, ["near", "far"]);
  });

  it("sem previsão vai pro fim do próprio grupo", () => {
    const withDate = record({ id: "with_date", delivery_status: "PENDING", expected_delivery_date: TOMORROW });
    const withoutDate = record({ id: "without_date", delivery_status: "PENDING", expected_delivery_date: null });
    const sorted = sortRecordsForListing([withoutDate, withDate], TODAY).map((r) => r.id);
    assert.deepEqual(sorted, ["with_date", "without_date"]);
  });

  it("desempate final determinístico por id (nunca pula/repete linha ao paginar)", () => {
    const a = record({ id: "a", delivery_status: "PENDING", expected_delivery_date: TOMORROW });
    const b = record({ id: "b", delivery_status: "PENDING", expected_delivery_date: TOMORROW });
    assert.equal(compareForListing(a, b, TODAY), -1);
    assert.equal(compareForListing(b, a, TODAY), 1);
    assert.equal(compareForListing(a, a, TODAY), 0);
  });
});

describe("todayIsoInStoreTimeZone", () => {
  it("devolve AAAA-MM-DD", () => {
    assert.match(todayIsoInStoreTimeZone(), /^\d{4}-\d{2}-\d{2}$/);
  });
});
