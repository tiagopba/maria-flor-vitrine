import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ALL_DELIVERY_STATUSES,
  DELIVERY_STATUSES,
  DELIVERY_STATUS_LABELS,
  UNKNOWN_SELLER_LABEL,
  describeSellerOrigin,
  formatOriginLabel,
  isDeliveryStatus,
  isFormDeliveryStatus,
  statusesForSource,
} from "../delivery.ts";
import { FILTER_NONE, filtersToSearchParams, parseListFilters } from "../filters.ts";

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
      "Situação não informada",
    ]);
    assert.equal(isDeliveryStatus("CONFIRMED"), false);
  });

  it("UNKNOWN ('Situação não informada') existe, mas NÃO é oferecido no fluxo normal", () => {
    assert.equal(ALL_DELIVERY_STATUSES.length, 7);
    assert.equal(DELIVERY_STATUS_LABELS.UNKNOWN, "Situação não informada");
    assert.equal(isDeliveryStatus("UNKNOWN"), true);
    assert.equal(isFormDeliveryStatus("UNKNOWN"), false);
    assert.equal(statusesForSource("PDF_UPLOAD").includes("UNKNOWN"), false);
    assert.equal(statusesForSource("HISTORICAL_IMPORT").includes("UNKNOWN"), true);
    assert.deepEqual([...statusesForSource("PDF_UPLOAD")], [...DELIVERY_STATUSES]);
  });
});

describe("describeSellerOrigin", () => {
  it("vendedora conhecida + origem: mostra os dois, nenhum substitui o outro", () => {
    assert.deepEqual(describeSellerOrigin("Camila", "ONLINE"), { primary: "Camila", secondary: "Origem: Online" });
  });

  it("vendedora conhecida sem origem", () => {
    assert.deepEqual(describeSellerOrigin("Camila", null), { primary: "Camila", secondary: null });
  });

  it("origem sem vendedora conhecida: 'Vendedora não informada' + a origem", () => {
    assert.deepEqual(describeSellerOrigin(null, "ONLINE"), {
      primary: "Vendedora não informada",
      secondary: "Origem: Online",
    });
  });

  it("desconhecido: só 'Vendedora não informada' (nunca um cadastro fictício)", () => {
    assert.deepEqual(describeSellerOrigin(null, null), { primary: "Vendedora não informada", secondary: null });
    assert.equal(UNKNOWN_SELLER_LABEL, "Vendedora não informada");
  });

  it("origens futuras (TRAY, META) ficam legíveis", () => {
    assert.equal(formatOriginLabel("TRAY"), "Tray");
    assert.equal(formatOriginLabel("META"), "Meta");
  });
});

describe("parseListFilters", () => {
  it("lê e sanitiza cada filtro (vendedora e origem independentes)", () => {
    const filters = parseListFilters({
      q: "  maria ",
      de: "2026-10-01",
      ate: "2026-10-31",
      vendedora: "123e4567-e89b-42d3-a456-426614174000",
      origem: "online",
      transportadora: "Correios",
      status: "DELIVERED",
      uf: "ms",
      pagina: "3",
    });
    assert.deepEqual(filters, {
      query: "maria",
      saleFrom: "2026-10-01",
      saleTo: "2026-10-31",
      seller: "123e4567-e89b-42d3-a456-426614174000",
      origin: "ONLINE",
      carrier: "Correios",
      status: "DELIVERED",
      state: "MS",
      followup: "",
      page: 3,
    });
  });

  it("filtrar só por origem não exige vendedora, e vice-versa", () => {
    const onlyOrigin = parseListFilters({ origem: "ONLINE" });
    assert.equal(onlyOrigin.seller, "");
    assert.equal(onlyOrigin.origin, "ONLINE");
    const onlySeller = parseListFilters({ vendedora: FILTER_NONE });
    assert.equal(onlySeller.seller, FILTER_NONE);
    assert.equal(onlySeller.origin, "");
    assert.equal(parseListFilters({ origem: FILTER_NONE }).origin, FILTER_NONE);
  });

  it("valores inválidos viram 'sem filtro'", () => {
    const filters = parseListFilters({
      de: "2026-02-31",
      ate: "ontem",
      vendedora: "nao-e-uuid",
      status: "CONFIRMED",
      uf: "SAO",
      pagina: "-4",
    });
    assert.equal(filters.saleFrom, "");
    assert.equal(filters.saleTo, "");
    assert.equal(filters.seller, "");
    assert.equal(filters.status, "");
    assert.equal(filters.state, "");
    assert.equal(filters.page, 1);
  });

  it("monta a querystring da paginação só com o que está preenchido", () => {
    const filters = parseListFilters({ status: "IN_TRANSIT", uf: "SP", origem: "ONLINE" });
    assert.equal(filtersToSearchParams(filters, 2).toString(), "origem=ONLINE&status=IN_TRANSIT&uf=SP&pagina=2");
    assert.equal(filtersToSearchParams(parseListFilters({}), 1).toString(), "");
  });
});
