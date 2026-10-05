import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DELIVERY_STATUSES,
  DELIVERY_STATUS_LABELS,
  UNKNOWN_SELLER_LABEL,
  formatSellerOrigin,
  isDeliveryStatus,
} from "../delivery.ts";
import { filtersToSearchParams, parseListFilters, parseSellerOriginFilter } from "../filters.ts";

describe("delivery status", () => {
  it("tem os 6 valores e rótulos em português", () => {
    assert.deepEqual([...DELIVERY_STATUSES], ["PENDING", "IN_TRANSIT", "DELIVERED", "RESENT", "REFUNDED", "DELIVERY_ISSUE"]);
    assert.deepEqual(Object.values(DELIVERY_STATUS_LABELS), [
      "Aguardando envio",
      "Em trânsito",
      "Entregue",
      "Reenviado",
      "Estornado",
      "Problema na entrega",
    ]);
    assert.equal(isDeliveryStatus("CONFIRMED"), false);
  });
});

describe("formatSellerOrigin", () => {
  it("vendedora, origem ou 'Vendedora não informada' — nunca um cadastro fictício", () => {
    assert.equal(formatSellerOrigin("Ana", null), "Ana");
    assert.equal(formatSellerOrigin(null, "ONLINE"), "ONLINE");
    assert.equal(formatSellerOrigin(null, null), "Vendedora não informada");
    assert.equal(UNKNOWN_SELLER_LABEL, "Vendedora não informada");
    assert.equal(formatSellerOrigin(null, undefined), "Vendedora não informada");
  });
});

describe("parseListFilters", () => {
  it("lê e sanitiza cada filtro", () => {
    const filters = parseListFilters({
      q: "  maria ",
      de: "2026-10-01",
      ate: "2026-10-31",
      vendedora: "seller:123e4567-e89b-42d3-a456-426614174000",
      transportadora: "Correios",
      status: "DELIVERED",
      uf: "ms",
      pagina: "3",
    });
    assert.deepEqual(filters, {
      query: "maria",
      saleFrom: "2026-10-01",
      saleTo: "2026-10-31",
      sellerOrigin: "seller:123e4567-e89b-42d3-a456-426614174000",
      carrier: "Correios",
      status: "DELIVERED",
      state: "MS",
      page: 3,
    });
  });

  it("valores inválidos viram 'sem filtro'", () => {
    const filters = parseListFilters({
      de: "2026-02-31",
      ate: "ontem",
      vendedora: "seller:nao-e-uuid",
      status: "CONFIRMED",
      uf: "SAO",
      pagina: "-4",
    });
    assert.equal(filters.saleFrom, "");
    assert.equal(filters.saleTo, "");
    assert.equal(filters.sellerOrigin, "");
    assert.equal(filters.status, "");
    assert.equal(filters.state, "");
    assert.equal(filters.page, 1);
  });

  it("vendedora/origem: vendedora, origem ou não informada", () => {
    assert.deepEqual(parseSellerOriginFilter("origin:ONLINE"), { kind: "origin", origin: "ONLINE" });
    assert.deepEqual(parseSellerOriginFilter("none"), { kind: "none" });
    assert.equal(parseSellerOriginFilter("origin:"), null);
    assert.equal(parseSellerOriginFilter("qualquer"), null);
  });

  it("monta a querystring da paginação só com o que está preenchido", () => {
    const filters = parseListFilters({ status: "IN_TRANSIT", uf: "SP" });
    assert.equal(filtersToSearchParams(filters, 2).toString(), "status=IN_TRANSIT&uf=SP&pagina=2");
    assert.equal(filtersToSearchParams(parseListFilters({}), 1).toString(), "");
  });
});
