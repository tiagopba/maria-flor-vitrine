import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCarrier } from "../format.ts";
import { fulfillmentRecordSchema } from "../schema.ts";
import { buildDateFilter, buildSearchFilter } from "../search.ts";

describe("buildSearchFilter", () => {
  it("vazio não filtra", () => {
    assert.equal(buildSearchFilter("   "), null);
  });

  it("nome: normaliza caixa/acento e busca no campo de busca", () => {
    const filter = buildSearchFilter("  Márcia  EXEMPLO ");
    assert.ok(filter?.includes("customer_name_search.ilike.%marcia exemplo%"));
  });

  it("CPF com ou sem pontuação vira os mesmos dígitos", () => {
    const withMask = buildSearchFilter("111.444.777-35");
    const plain = buildSearchFilter("11144477735");
    assert.ok(withMask?.includes("customer_cpf.ilike.%11144477735%"));
    assert.ok(plain?.includes("customer_cpf.ilike.%11144477735%"));
  });

  it("número da NF-e ignora zeros à esquerda", () => {
    assert.ok(buildSearchFilter("000006")?.includes("nfe_number.eq.6"));
    assert.ok(buildSearchFilter("6")?.includes("nfe_number.eq.6"));
  });

  it("rastreio: alfanumérico em caixa alta", () => {
    assert.ok(buildSearchFilter("888100009999999")?.includes("tracking_code.ilike.%888100009999999%"));
    assert.ok(buildSearchFilter("pr123456789br")?.includes("tracking_code.ilike.%PR123456789BR%"));
  });

  it("nunca deixa caracteres especiais do PostgREST escaparem para o filtro", () => {
    const filter = buildSearchFilter("a,b(c).d*e%f_g\\h");
    assert.ok(filter);
    const values = filter!.split(",").map((part) => part.slice(part.indexOf(".", part.indexOf(".") + 1) + 1));
    for (const value of values) assert.match(value, /^%?[a-z0-9 ]*%?$/i);
  });
});

describe("buildDateFilter", () => {
  it("monta intervalo do dia no fuso da loja (UTC-4)", () => {
    const filter = buildDateFilter("2026-10-05");
    assert.ok(filter?.includes("nfe_issued_at.eq.2026-10-05"));
    assert.ok(filter?.includes("shipping_label_date.gte.2026-10-05T04:00:00.000Z"));
    assert.ok(filter?.includes("shipping_label_date.lt.2026-10-06T04:00:00.000Z"));
    assert.ok(filter?.includes("created_at.gte.2026-10-05T04:00:00.000Z"));
  });

  it("rejeita data inválida", () => {
    assert.equal(buildDateFilter("2026-02-31"), null);
    assert.equal(buildDateFilter("05/10/2026"), null);
    assert.equal(buildDateFilter("nope"), null);
  });
});

const baseInput = {
  customerName: "  Maria Souza ",
  customerDocument: "111.444.777-35",
  addressLine: "",
  addressNumber: "",
  addressComplement: "",
  neighborhood: "",
  postalCode: "01310-100",
  city: "São Paulo",
  state: "sp",
  nfeNumber: "000006",
  nfeSeries: "2",
  nfeKey: "5026 1011 2223 3300 0181 5500 2000 0000 0123 4567 8901",
  nfeProtocol: "150260000000001",
  nfeIssuedAt: "2026-10-02",
  itemsCount: "1",
  invoiceTotal: "1.139,99",
  carrier: "",
  shippingService: "",
  trackingCode: " 8881 0000 9999 999 ",
  shippingLabelDate: "2026-10-05T11:05",
};

describe("fulfillmentRecordSchema", () => {
  it("normaliza tudo para o formato das colunas", () => {
    const parsed = fulfillmentRecordSchema.parse(baseInput);
    assert.equal(parsed.customer_name, "Maria Souza");
    assert.equal(parsed.customer_name_search, "maria souza");
    assert.equal(parsed.customer_cpf, "11144477735");
    assert.equal(parsed.postal_code, "01310100");
    assert.equal(parsed.state, "SP");
    assert.equal(parsed.nfe_number, "6");
    assert.equal(parsed.nfe_key, "50261011222333000181550020000000012345678901");
    assert.equal(parsed.invoice_total, 1139.99);
    assert.equal(parsed.items_count, 1);
    assert.equal(parsed.tracking_code, "888100009999999");
    assert.equal(parsed.carrier, null);
    assert.equal(parsed.shipping_service, null);
    assert.equal(parsed.address_line, null);
    assert.equal(parsed.shipping_label_date, "2026-10-05T11:05:00-04:00");
  });

  it("só o nome é obrigatório", () => {
    const empty = Object.fromEntries(Object.keys(baseInput).map((key) => [key, ""]));
    assert.equal(fulfillmentRecordSchema.safeParse(empty).success, false);
    assert.equal(fulfillmentRecordSchema.safeParse({ ...empty, customerName: "Ana" }).success, true);
  });

  it("recusa valores malformados em vez de gravar lixo", () => {
    const bad = (patch: Record<string, string>) => fulfillmentRecordSchema.safeParse({ ...baseInput, ...patch }).success;
    assert.equal(bad({ customerDocument: "123" }), false);
    assert.equal(bad({ postalCode: "1234" }), false);
    assert.equal(bad({ state: "SAO" }), false);
    assert.equal(bad({ nfeKey: "123" }), false);
    assert.equal(bad({ nfeIssuedAt: "2026-13-40" }), false);
    assert.equal(bad({ invoiceTotal: "abc" }), false);
    assert.equal(bad({ itemsCount: "-1" }), false);
    assert.equal(bad({ shippingLabelDate: "ontem" }), false);
    assert.equal(bad({ trackingCode: "ab;cd" }), false);
  });

  it("Correios: serviço entra separado e o rastreio é normalizado e validado", () => {
    const correios = { ...baseInput, carrier: "Correios", shippingService: "SEDEX" };

    const ok = fulfillmentRecordSchema.parse({ ...correios, trackingCode: "AB 123 456 789 BR" });
    assert.equal(ok.carrier, "Correios");
    assert.equal(ok.shipping_service, "SEDEX");
    assert.equal(ok.tracking_code, "AB123456789BR");

    assert.equal(fulfillmentRecordSchema.safeParse({ ...correios, trackingCode: "888100009999999" }).success, false);
    // Outra transportadora não herda a regra dos Correios.
    assert.equal(
      fulfillmentRecordSchema.safeParse({ ...baseInput, carrier: "J&T Express", trackingCode: "888100009999999" }).success,
      true
    );
  });

  it("formatCarrier combina transportadora e serviço", () => {
    assert.equal(formatCarrier("Correios", "SEDEX"), "Correios · SEDEX");
    assert.equal(formatCarrier("J&T Express", null), "J&T Express");
    assert.equal(formatCarrier(null, null), "—");
  });
});
