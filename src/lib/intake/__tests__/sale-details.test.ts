import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canEditIntakeSaleDetails, planIntakeSaleDetailsUpdate, type IntakeSaleDetailsCurrent } from "../sale-details.ts";

const CURRENT: IntakeSaleDetailsCurrent = {
  status: "CHECKING",
  saleTotal: 199.99,
  saleDate: "2026-10-20",
  sellerId: "11111111-1111-4111-8111-111111111111",
  hasAnyAttempt: true,
};

const SAME_INPUT = { saleTotal: CURRENT.saleTotal, saleDate: CURRENT.saleDate, sellerId: CURRENT.sellerId! };

describe("canEditIntakeSaleDetails: só antes de aprovada ou cancelada", () => {
  it("todos os status ativos permitem editar", () => {
    for (const status of ["AWAITING_CUSTOMER_DATA", "DATA_RECEIVED", "DOCUMENTS_PENDING", "CHECKING", "REVIEW_REQUIRED", "BLOCKED"] as const) {
      assert.equal(canEditIntakeSaleDetails(status), true, status);
    }
  });

  it("APPROVED e CANCELLED nunca permitem editar por aqui", () => {
    assert.equal(canEditIntakeSaleDetails("APPROVED"), false);
    assert.equal(canEditIntakeSaleDetails("CANCELLED"), false);
  });
});

describe("planIntakeSaleDetailsUpdate: decide o que salvar e se invalida a conferência", () => {
  it("recusa em APPROVED/CANCELLED, mesmo com dados válidos", () => {
    const r1 = planIntakeSaleDetailsUpdate({ ...CURRENT, status: "APPROVED" }, { ...SAME_INPUT, saleTotal: 179.99 });
    assert.equal(r1.ok, false);
    const r2 = planIntakeSaleDetailsUpdate({ ...CURRENT, status: "CANCELLED" }, { ...SAME_INPUT, saleTotal: 179.99 });
    assert.equal(r2.ok, false);
  });

  it("nada mudou: recusa com 'nenhuma alteração'", () => {
    const r = planIntakeSaleDetailsUpdate(CURRENT, SAME_INPUT);
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.match(r.error, /nenhuma alteração/i);
  });

  it("só data ou vendedora mudou, SEM nenhuma tentativa: salva normalmente, nunca invalida", () => {
    const current = { ...CURRENT, hasAnyAttempt: false };
    const r = planIntakeSaleDetailsUpdate(current, { ...SAME_INPUT, saleDate: "2026-10-25" });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.changedFields, ["sale_date"]);
    assert.equal(r.forceDocumentsPending, false);
    assert.deepEqual(r.update, { sale_date: "2026-10-25" });
  });

  it("só data ou vendedora mudou, COM tentativa existente: salva normalmente, NUNCA invalida (não participam do Confere Geral)", () => {
    const r = planIntakeSaleDetailsUpdate(CURRENT, { ...SAME_INPUT, sellerId: "22222222-2222-4222-8222-222222222222" });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.changedFields, ["seller_id"]);
    assert.equal(r.forceDocumentsPending, false);
    assert.deepEqual(r.update, { seller_id: "22222222-2222-4222-8222-222222222222" });
  });

  it("valor mudou, SEM nenhuma tentativa de conferência: salva normalmente, sem forçar status", () => {
    const current = { ...CURRENT, hasAnyAttempt: false };
    const r = planIntakeSaleDetailsUpdate(current, { ...SAME_INPUT, saleTotal: 179.99 });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.changedFields, ["sale_total"]);
    assert.equal(r.forceDocumentsPending, false);
    assert.deepEqual(r.update, { sale_total: 179.99 });
  });

  it("valor mudou e JÁ existe tentativa: força DOCUMENTS_PENDING, mesmo em REVIEW_REQUIRED/BLOCKED", () => {
    for (const status of ["CHECKING", "REVIEW_REQUIRED", "BLOCKED"] as const) {
      const r = planIntakeSaleDetailsUpdate({ ...CURRENT, status }, { ...SAME_INPUT, saleTotal: 179.99 });
      assert.ok(r.ok, status);
      if (!r.ok) return;
      assert.equal(r.forceDocumentsPending, true, status);
      assert.deepEqual(r.update, { sale_total: 179.99 });
    }
  });

  it("valor e data mudam juntos, com tentativa existente: os dois são salvos, e ainda força DOCUMENTS_PENDING", () => {
    const r = planIntakeSaleDetailsUpdate(CURRENT, { ...SAME_INPUT, saleTotal: 179.99, saleDate: "2026-10-25" });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual([...r.changedFields].sort(), ["sale_date", "sale_total"]);
    assert.equal(r.forceDocumentsPending, true);
    assert.deepEqual(r.update, { sale_total: 179.99, sale_date: "2026-10-25" });
  });

  it("vendedora nula no banco, agora escolhida: conta como mudança", () => {
    const current = { ...CURRENT, sellerId: null, hasAnyAttempt: false };
    const r = planIntakeSaleDetailsUpdate(current, SAME_INPUT);
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(r.changedFields, ["seller_id"]);
  });

  it("nunca apaga nem reescreve nada de fulfillment_verification_attempts — o plano só decide colunas da intake", () => {
    const r = planIntakeSaleDetailsUpdate(CURRENT, { ...SAME_INPUT, saleTotal: 179.99 });
    assert.ok(r.ok);
    if (!r.ok) return;
    assert.deepEqual(Object.keys(r.update).sort(), ["sale_total"]);
  });
});
