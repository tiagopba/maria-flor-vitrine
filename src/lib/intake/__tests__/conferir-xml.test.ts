import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NFE_XML_1215 } from "../../fulfillment/__tests__/fixtures.ts";
import { parseNfeXml } from "../../fulfillment/parse-nfe-xml.ts";
import { conferirXml } from "../conferir-xml.ts";
import type { ExpectedData } from "../conferir.ts";

function parsedXml() {
  const result = parseNfeXml(NFE_XML_1215);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("fixture inválida");
  return result.data;
}

/** Dados que a cliente informou — batem exatamente com o XML (caso GREEN). */
const MATCHING_EXPECTED: ExpectedData = {
  customerName: "MARIA DA SILVA EXEMPLO",
  cpf: "11144477735",
  address: {
    street: "Avenida Brasil",
    number: "1500",
    complement: "APTO 12 B",
    neighborhood: "Jardim das Palmeiras",
    city: "Sao Paulo",
    state: "SP",
    postalCode: "01310100",
  },
  recipientName: "MARIA DA SILVA EXEMPLO",
  saleTotal: 334.97,
};

describe("conferirXml: caso que originou a correção — GREEN quando tudo corresponde", () => {
  it("veredito GREEN, nenhuma divergência, campos extraídos corretos", () => {
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml: parsedXml() });
    assert.equal(outcome.verdict, "GREEN");
    assert.equal(outcome.blocking.length, 0);
    assert.equal(outcome.review.length, 0);
    assert.equal(outcome.extracted.nfe_number, "1215");
    assert.equal(outcome.extracted.nfe_series, "1");
    assert.equal(outcome.extracted.invoice_total, 334.97);
    assert.equal(outcome.extracted.carrier, "J&T Express");
  });

  it("nenhuma divergência criada por etiqueta: não existe nenhum campo prefixado com etiqueta_", () => {
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml: parsedXml() });
    for (const r of outcome.results) assert.doesNotMatch(r.field, /^etiqueta_|^nf_vs_etiqueta_/);
  });

  it("não extrai valor de DANFE: tracking_code e shipping_label_date nunca vêm preenchidos nesta etapa", () => {
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml: parsedXml() });
    assert.equal(outcome.extracted.tracking_code, null);
    assert.equal(outcome.extracted.shipping_label_date, null);
  });
});

describe("conferirXml: CPF", () => {
  it("CPF diferente → BLOCKED", () => {
    const outcome = conferirXml({ expected: { ...MATCHING_EXPECTED, cpf: "99988877766" }, xml: parsedXml() });
    assert.equal(outcome.verdict, "BLOCKED");
    assert.ok(outcome.blocking.some((r) => r.field === "cpf"));
  });

  it("CPF ausente no XML → REVIEW, nunca BLOCKED (pode ser falha de leitura, não divergência)", () => {
    const xml = { ...parsedXml(), recipientDocument: null };
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml });
    assert.ok(outcome.review.some((r) => r.field === "cpf"));
  });
});

describe("conferirXml: destinatário", () => {
  it("nome diferente do destinatário do XML → BLOCKED", () => {
    const xml = { ...parsedXml(), recipientName: "OUTRA PESSOA QUALQUER" };
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml });
    assert.ok(outcome.blocking.some((r) => r.field === "destinatario"));
  });
});

describe("conferirXml: endereço — rua, número, complemento, bairro, CEP, cidade, UF", () => {
  it("rua diferente → BLOCKED", () => {
    const xml = { ...parsedXml(), addressLine: "Rua Totalmente Diferente" };
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml });
    assert.ok(outcome.blocking.some((r) => r.field === "rua"));
  });

  it("número diferente → BLOCKED", () => {
    const xml = { ...parsedXml(), addressNumber: "9999" };
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml });
    assert.ok(outcome.blocking.some((r) => r.field === "numero"));
  });

  it("CEP diferente → BLOCKED", () => {
    const xml = { ...parsedXml(), postalCode: "99999999" };
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml });
    assert.ok(outcome.blocking.some((r) => r.field === "cep"));
  });

  it("cidade diferente → BLOCKED", () => {
    const xml = { ...parsedXml(), city: "Outra Cidade" };
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml });
    assert.ok(outcome.blocking.some((r) => r.field === "cidade"));
  });

  it("UF diferente → BLOCKED", () => {
    const xml = { ...parsedXml(), state: "RJ" };
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml });
    assert.ok(outcome.blocking.some((r) => r.field === "uf"));
  });

  it("complemento diferente → REVIEW (campo soft, nunca bloqueia)", () => {
    const xml = { ...parsedXml(), addressComplement: "FUNDOS" };
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml });
    assert.ok(outcome.review.some((r) => r.field === "complemento"));
    assert.equal(outcome.verdict, "REVIEW");
  });

  it("bairro diferente → REVIEW (campo soft, nunca bloqueia)", () => {
    const xml = { ...parsedXml(), neighborhood: "Outro Bairro" };
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml });
    assert.ok(outcome.review.some((r) => r.field === "bairro"));
  });
});

describe("conferirXml: valor da venda × vNF", () => {
  it("vNF diferente do valor da venda → BLOCKED, sem tolerância de centavos", () => {
    const xml = { ...parsedXml(), invoiceTotal: 334.98 };
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml });
    assert.ok(outcome.blocking.some((r) => r.field === "valor"));
  });

  it("vNF igual (334.97) → OK", () => {
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml: parsedXml() });
    assert.ok(outcome.results.some((r) => r.field === "valor" && r.verdict === "OK"));
  });
});

describe("conferirXml: transportadora", () => {
  it("presente e reconhecida (J&T) → extracted.carrier = 'J&T Express', mas NUNCA bloqueia o Confere Geral", () => {
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml: parsedXml() });
    assert.equal(outcome.extracted.carrier, "J&T Express");
    assert.ok(!outcome.results.some((r) => r.field === "carrier"));
  });

  it("ausente (sem transp/transporta no XML) → extracted.carrier = null, continua não bloqueando", () => {
    const xml = { ...parsedXml(), carrierNameRaw: null };
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml });
    assert.equal(outcome.extracted.carrier, null);
    assert.notEqual(outcome.verdict, "BLOCKED");
  });

  it("presente mas desconhecida (não é J&T nem Correios) → carrier null, nunca inventa um valor nem bloqueia", () => {
    const xml = { ...parsedXml(), carrierNameRaw: "TRANSPORTADORA DESCONHECIDA LTDA" };
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml });
    assert.equal(outcome.extracted.carrier, null);
  });

  it("nunca infere pela numeração do rastreio: não há rastreio nesta etapa e o carrier não muda por causa disso", () => {
    // xml.carrierNameRaw desconhecido continua null mesmo que um futuro tracking_code
    // comece com 888 (padrão J&T) — essa inferência não existe mais neste fluxo.
    const xml = { ...parsedXml(), carrierNameRaw: "TRANSPORTADORA XYZ" };
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml });
    assert.equal(outcome.extracted.carrier, null);
  });
});
