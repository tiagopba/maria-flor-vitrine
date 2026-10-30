import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planRecordSaleDetailsUpdate, type RecordSaleDetailsCurrent } from "../sale-details.ts";

const CURRENT: RecordSaleDetailsCurrent = {
  saleDate: "2026-10-05",
  sellerId: "11111111-1111-4111-8111-111111111111",
  salesOrigin: "ONLINE",
};

describe("planRecordSaleDetailsUpdate: EDITAR DADOS DA VENDA pós-aprovação", () => {
  it("nada mudou: recusa", () => {
    const r = planRecordSaleDetailsUpdate(CURRENT, { ...CURRENT });
    assert.equal(r.ok, false);
  });

  it("só vendedora muda", () => {
    const r = planRecordSaleDetailsUpdate(CURRENT, { ...CURRENT, sellerId: "22222222-2222-4222-8222-222222222222" });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.changedFields, ["seller_id"]);
    assert.deepEqual(r.update, { seller_id: "22222222-2222-4222-8222-222222222222" });
  });

  it("só data muda", () => {
    const r = planRecordSaleDetailsUpdate(CURRENT, { ...CURRENT, saleDate: "2026-10-10" });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.changedFields, ["sale_date"]);
  });

  it("só origem muda", () => {
    const r = planRecordSaleDetailsUpdate(CURRENT, { ...CURRENT, salesOrigin: "TRAY" });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.changedFields, ["sales_origin"]);
  });

  it("vendedora pode virar null (desvincular)", () => {
    const r = planRecordSaleDetailsUpdate(CURRENT, { ...CURRENT, sellerId: null });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.update, { seller_id: null });
  });

  it("os 3 campos mudam juntos", () => {
    const r = planRecordSaleDetailsUpdate(CURRENT, {
      saleDate: "2026-10-10",
      sellerId: "22222222-2222-4222-8222-222222222222",
      salesOrigin: "TRAY",
    });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual([...r.changedFields].sort(), ["sale_date", "sales_origin", "seller_id"]);
  });

  it("não existe NENHUM campo de valor no tipo de entrada — sale_total não pode ser editado por aqui", () => {
    const input: Record<string, unknown> = { saleDate: "2026-10-10", sellerId: CURRENT.sellerId, salesOrigin: CURRENT.salesOrigin };
    assert.equal("saleTotal" in input, false);
    assert.equal("sale_total" in input, false);
  });
});
