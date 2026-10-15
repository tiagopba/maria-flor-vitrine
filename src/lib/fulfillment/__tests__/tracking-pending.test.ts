import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ALL_DELIVERY_STATUSES, isPendingTracking, requiresTrackingInfo } from "../delivery.ts";

describe("requiresTrackingInfo: status operacionalmente encerrados nunca bloqueiam Nova Venda", () => {
  it("DELIVERED, REFUNDED e UNKNOWN não exigem rastreio novo", () => {
    assert.equal(requiresTrackingInfo("DELIVERED"), false);
    assert.equal(requiresTrackingInfo("REFUNDED"), false);
    assert.equal(requiresTrackingInfo("UNKNOWN"), false);
  });

  it("PENDING, IN_TRANSIT, RESENT e DELIVERY_ISSUE continuam ativos e exigem rastreio", () => {
    assert.equal(requiresTrackingInfo("PENDING"), true);
    assert.equal(requiresTrackingInfo("IN_TRANSIT"), true);
    assert.equal(requiresTrackingInfo("RESENT"), true);
    assert.equal(requiresTrackingInfo("DELIVERY_ISSUE"), true);
  });

  it("cobre todo ALL_DELIVERY_STATUSES — nenhum status novo passa despercebido", () => {
    assert.deepEqual([...ALL_DELIVERY_STATUSES].sort(), [
      "DELIVERED",
      "DELIVERY_ISSUE",
      "IN_TRANSIT",
      "PENDING",
      "REFUNDED",
      "RESENT",
      "UNKNOWN",
    ]);
  });
});

describe("isPendingTracking: rastreamento pendente (badge + bloqueio de Nova Venda)", () => {
  it("PENDING sem tracking_code (nulo ou vazio/espaço) é pendente", () => {
    assert.equal(isPendingTracking(null, "PENDING"), true);
    assert.equal(isPendingTracking("", "PENDING"), true);
    assert.equal(isPendingTracking("   ", "PENDING"), true);
  });

  it("com tracking_code preenchido nunca é pendente, em nenhum status ativo", () => {
    assert.equal(isPendingTracking("888100002197060", "PENDING"), false);
    assert.equal(isPendingTracking("888100002197060", "IN_TRANSIT"), false);
    assert.equal(isPendingTracking("888100002197060", "DELIVERY_ISSUE"), false);
  });

  it("DELIVERED/REFUNDED/UNKNOWN nunca são pendentes, mesmo sem tracking_code (registro encerrado ou histórico)", () => {
    assert.equal(isPendingTracking(null, "DELIVERED"), false);
    assert.equal(isPendingTracking(null, "REFUNDED"), false);
    assert.equal(isPendingTracking(null, "UNKNOWN"), false);
  });

  it("IN_TRANSIT/RESENT/DELIVERY_ISSUE sem tracking_code também bloqueiam (caso raro, mas ainda ativo)", () => {
    assert.equal(isPendingTracking(null, "IN_TRANSIT"), true);
    assert.equal(isPendingTracking(null, "RESENT"), true);
    assert.equal(isPendingTracking(null, "DELIVERY_ISSUE"), true);
  });
});
