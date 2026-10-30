import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gainedTrackingInfo, planDeliveryUpdate, shouldAutoSetInTransit, type DeliveryState } from "../delivery-update.ts";
import type { DeliveryStatus } from "../delivery.ts";
import { deliveryUpdateSchema, editRecordSaleDetailsSchema } from "../schema.ts";

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

describe("shouldAutoSetInTransit — só sobe PENDING, nunca sobrescreve outro status", () => {
  const cases: [DeliveryStatus, boolean][] = [
    ["PENDING", true],
    ["IN_TRANSIT", false],
    ["DELIVERY_ISSUE", false],
    ["RESENT", false],
    ["DELIVERED", false],
    ["REFUNDED", false],
    ["UNKNOWN", false],
  ];
  for (const [status, expected] of cases) {
    it(`${status} → ${expected}`, () => assert.equal(shouldAutoSetInTransit(status), expected));
  }
});

describe("gainedTrackingInfo — só true quando vai de incompleto pra completo", () => {
  it("PENDING sem rastreio → ganha transportadora + rastreio: true", () => {
    assert.equal(
      gainedTrackingInfo({ carrier: null, trackingCode: null }, { carrier: "J&T Express", trackingCode: "ABC123" }),
      true
    );
  });

  it("transportadora já existia, só o rastreio chega agora: true", () => {
    assert.equal(
      gainedTrackingInfo({ carrier: "J&T Express", trackingCode: null }, { carrier: "J&T Express", trackingCode: "ABC123" }),
      true
    );
  });

  it("já tinha os dois antes: false (editar um rastreio existente não é 'ganhar')", () => {
    assert.equal(
      gainedTrackingInfo({ carrier: "J&T Express", trackingCode: "OLD123" }, { carrier: "J&T Express", trackingCode: "NEW456" }),
      false
    );
  });

  it("continua sem nenhum dos dois: false", () => {
    assert.equal(gainedTrackingInfo({ carrier: null, trackingCode: null }, { carrier: null, trackingCode: "" }), false);
  });
});

describe("auto IN_TRANSIT ao salvar transportadora + rastreio — matriz pedida pelo usuário", () => {
  const auto = (status: DeliveryStatus, had: boolean) =>
    shouldAutoSetInTransit(status) &&
    gainedTrackingInfo({ carrier: had ? "X" : null, trackingCode: had ? "X" : null }, { carrier: "J&T Express", trackingCode: "ABC123" });

  it("PENDING sem rastreio → salva J&T + rastreio → vira IN_TRANSIT", () => {
    assert.equal(auto("PENDING", false), true);
  });
  it("PENDING com transportadora já existente e novo rastreio → vira IN_TRANSIT", () => {
    assert.equal(
      shouldAutoSetInTransit("PENDING") &&
        gainedTrackingInfo({ carrier: "J&T Express", trackingCode: null }, { carrier: "J&T Express", trackingCode: "ABC123" }),
      true
    );
  });
  it("IN_TRANSIT → continua IN_TRANSIT (não reaplica)", () => assert.equal(auto("IN_TRANSIT", false), false));
  it("DELIVERY_ISSUE → não muda", () => assert.equal(auto("DELIVERY_ISSUE", false), false));
  it("RESENT → não muda", () => assert.equal(auto("RESENT", false), false));
  it("DELIVERED → não muda", () => assert.equal(auto("DELIVERED", false), false));
  it("REFUNDED → não muda", () => assert.equal(auto("REFUNDED", false), false));
});

describe("editRecordSaleDetailsSchema: EDITAR DADOS DA VENDA (pós-aprovação) — sem campo de valor", () => {
  const EDIT = { saleDate: "2026-10-20", sellerId: "11111111-1111-4111-8111-111111111111", salesOrigin: "online" };

  it("aceita dados válidos e normaliza a origem para CAIXA ALTA", () => {
    const r = editRecordSaleDetailsSchema.safeParse(EDIT);
    assert.ok(r.success);
    if (!r.success) return;
    assert.equal(r.data.salesOrigin, "ONLINE");
  });

  it("data da venda é obrigatória", () => {
    assert.equal(editRecordSaleDetailsSchema.safeParse({ ...EDIT, saleDate: "" }).success, false);
  });

  it("vendedora vazia vira null (desvincular é permitido)", () => {
    const r = editRecordSaleDetailsSchema.safeParse({ ...EDIT, sellerId: "" });
    assert.ok(r.success);
    if (!r.success) return;
    assert.equal(r.data.sellerId, null);
  });

  it("vendedora com formato inválido (não vazio, não UUID) é recusada", () => {
    assert.equal(editRecordSaleDetailsSchema.safeParse({ ...EDIT, sellerId: "não-é-uuid" }).success, false);
  });

  it("origem 'X' ou vazia vira null — nunca grava a marca antiga da planilha", () => {
    assert.equal(editRecordSaleDetailsSchema.safeParse({ ...EDIT, salesOrigin: "x" }).success && editRecordSaleDetailsSchema.parse({ ...EDIT, salesOrigin: "x" }).salesOrigin, null);
    assert.equal(editRecordSaleDetailsSchema.parse({ ...EDIT, salesOrigin: "" }).salesOrigin, null);
  });

  it("não tem NENHUM campo de valor — nem no shape do zod", () => {
    const shape = editRecordSaleDetailsSchema.shape as Record<string, unknown>;
    assert.equal("saleTotal" in shape, false);
  });
});
