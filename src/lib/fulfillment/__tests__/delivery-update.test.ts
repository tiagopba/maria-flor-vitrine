import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planDeliveryUpdate, type DeliveryState } from "../delivery-update.ts";
import { deliveryUpdateSchema } from "../schema.ts";

const current: DeliveryState = {
  delivery_status: "PENDING",
  expected_delivery_date: "2026-10-12",
  delivered_at: null,
  notes: null,
  carrier: "Correios",
  shipping_service: "SEDEX",
  tracking_code: "AB123456789BR",
};

const form = (patch: Record<string, string> = {}) => ({
  carrier: "Correios",
  shippingService: "SEDEX",
  trackingCode: "AB123456789BR",
  expectedDeliveryDate: "2026-10-12",
  deliveryStatus: "PENDING",
  deliveredAt: "",
  notes: "",
  confirmClearDelivery: "",
  ...patch,
});

const plan = (state: DeliveryState, patch: Record<string, string>) =>
  planDeliveryUpdate(state, deliveryUpdateSchema.parse(form(patch)));

describe("deliveryUpdateSchema", () => {
  it("DELIVERED exige a data de entrega", () => {
    assert.equal(deliveryUpdateSchema.safeParse(form({ deliveryStatus: "DELIVERED" })).success, false);
    assert.equal(
      deliveryUpdateSchema.safeParse(form({ deliveryStatus: "DELIVERED", deliveredAt: "2026-10-10" })).success,
      true
    );
  });

  it("data de entrega sem status Entregue é recusada", () => {
    assert.equal(deliveryUpdateSchema.safeParse(form({ deliveredAt: "2026-10-10" })).success, false);
  });

  it("mantém as regras de rastreio dos Correios e valida os 6 status", () => {
    assert.equal(deliveryUpdateSchema.safeParse(form({ trackingCode: "123" })).success, false);
    assert.equal(deliveryUpdateSchema.safeParse(form({ deliveryStatus: "CONFIRMED" })).success, false);
    for (const status of ["PENDING", "IN_TRANSIT", "RESENT", "REFUNDED", "DELIVERY_ISSUE"]) {
      assert.equal(deliveryUpdateSchema.safeParse(form({ deliveryStatus: status })).success, true, status);
    }
  });
});

describe("planDeliveryUpdate", () => {
  it("registra status anterior/novo e só os NOMES dos campos alterados", () => {
    const result = plan(current, { deliveryStatus: "IN_TRANSIT", notes: "ligou a cliente 11144477735" });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.previousStatus, "PENDING");
    assert.equal(result.newStatus, "IN_TRANSIT");
    assert.deepEqual(result.changedFields, ["delivery_status", "notes"]);
    // Nenhum valor (nem das observações) escapa para o que será auditado.
    assert.equal(JSON.stringify([result.changedFields, result.previousStatus, result.newStatus]).includes("11144477735"), false);
  });

  it("sem mudança nenhuma não grava nem audita", () => {
    const result = plan(current, {});
    assert.equal(result.ok, false);
  });

  it("transportadora/serviço/rastreio entram quando mudam", () => {
    const result = plan(current, { carrier: "Jadlog", shippingService: "", trackingCode: "JD0001" });
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.changedFields, ["carrier", "shipping_service", "tracking_code"]);
  });

  it("marcar Entregue grava a data de entrega", () => {
    const result = plan(current, { deliveryStatus: "DELIVERED", deliveredAt: "2026-10-10" });
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.update.delivered_at, "2026-10-10");
      assert.deepEqual(result.changedFields, ["delivery_status", "delivered_at"]);
    }
  });

  it("sair de Entregue exige confirmar a remoção da data — nunca deixa data incoerente", () => {
    const delivered: DeliveryState = { ...current, delivery_status: "DELIVERED", delivered_at: "2026-10-10" };

    const without = plan(delivered, { deliveryStatus: "RESENT" });
    assert.equal(without.ok, false);
    if (!without.ok) assert.ok(without.fieldErrors.confirmClearDelivery?.includes("10/10/2026"));

    const confirmed = plan(delivered, { deliveryStatus: "RESENT", confirmClearDelivery: "on" });
    assert.equal(confirmed.ok, true);
    if (confirmed.ok) {
      assert.equal(confirmed.update.delivered_at, null);
      assert.equal(confirmed.update.delivery_status, "RESENT");
      assert.deepEqual(confirmed.changedFields, ["delivery_status", "delivered_at"]);
    }
  });

  it("continuar Entregue só corrigindo a data de entrega não pede confirmação", () => {
    const delivered: DeliveryState = { ...current, delivery_status: "DELIVERED", delivered_at: "2026-10-10" };
    const result = plan(delivered, { deliveryStatus: "DELIVERED", deliveredAt: "2026-10-11" });
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.changedFields, ["delivered_at"]);
  });
});
