import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  NFE_XML_1215,
  NFE_XML_1217_FABIANE,
  NFE_XML_1218_BEATRIZ,
  NFE_XML_1219_DANIELA,
  NFE_XML_1220_TATIANE,
  NFE_XML_STREET_PREFIX_CASE,
} from "../../fulfillment/__tests__/fixtures.ts";
import { parseNfeXml } from "../../fulfillment/parse-nfe-xml.ts";
import { conferirXml } from "../conferir-xml.ts";
import type { ExpectedData } from "../conferir.ts";

function parsedXml(xml: string = NFE_XML_1215) {
  const result = parseNfeXml(xml);
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

describe("conferirXml: override de frete legado (legacyFreightOverrideActive)", () => {
  it("sem override (padrão): vNF diferente continua BLOCKED, igual sempre foi", () => {
    const xml = { ...parsedXml(), invoiceTotal: 334.98 };
    const outcome = conferirXml({ expected: MATCHING_EXPECTED, xml });
    assert.equal(outcome.verdict, "BLOCKED");
    assert.ok(outcome.blocking.some((r) => r.field === "valor"));
  });

  it("com override ativo: a mesma diferença de valor deixa de bloquear, vira OK com overrideCode — nunca em blocking nem em review", () => {
    const xml = { ...parsedXml(), invoiceTotal: 334.98 };
    const outcome = conferirXml({ expected: { ...MATCHING_EXPECTED, legacyFreightOverrideActive: true }, xml });
    const valorResult = outcome.results.find((r) => r.field === "valor");
    assert.equal(valorResult?.verdict, "OK");
    assert.equal(valorResult?.overrideCode, "LEGACY_FREIGHT_NOT_INCLUDED_IN_NFE");
    assert.match(valorResult?.reason ?? "", /frete legado/i);
    assert.ok(!outcome.blocking.some((r) => r.field === "valor"));
    assert.ok(!outcome.review.some((r) => r.field === "valor"));
    assert.ok(!outcome.reviewFields.includes("valor"));
  });

  it("com override ativo e nenhuma outra divergência: veredito geral vira GREEN (o override não precisa de revisão humana)", () => {
    const xml = { ...parsedXml(), invoiceTotal: 334.98 };
    const outcome = conferirXml({ expected: { ...MATCHING_EXPECTED, legacyFreightOverrideActive: true }, xml });
    assert.equal(outcome.verdict, "GREEN");
  });

  it("com override ativo mas OUTRA divergência real (bairro): o override só perdoa valor — veredito continua REVIEW pelo bairro", () => {
    const xml = { ...parsedXml(), invoiceTotal: 334.98, neighborhood: "Outro Bairro" };
    const outcome = conferirXml({ expected: { ...MATCHING_EXPECTED, legacyFreightOverrideActive: true }, xml });
    assert.equal(outcome.verdict, "REVIEW");
    assert.ok(outcome.review.some((r) => r.field === "bairro"));
    assert.ok(!outcome.blocking.some((r) => r.field === "valor"));
  });

  it("com override ativo mas CPF divergente: o override não perdoa nada além de valor — continua BLOCKED", () => {
    const xml = { ...parsedXml(), invoiceTotal: 334.98 };
    const outcome = conferirXml({
      expected: { ...MATCHING_EXPECTED, legacyFreightOverrideActive: true, cpf: "99988877766" },
      xml,
    });
    assert.equal(outcome.verdict, "BLOCKED");
    assert.ok(outcome.blocking.some((r) => r.field === "cpf"));
  });

  it("override ativo mas valor BATE: nenhum overrideCode aparece (o override só age quando há diferença de verdade)", () => {
    const outcome = conferirXml({ expected: { ...MATCHING_EXPECTED, legacyFreightOverrideActive: true }, xml: parsedXml() });
    const valorResult = outcome.results.find((r) => r.field === "valor");
    assert.equal(valorResult?.verdict, "OK");
    assert.equal(valorResult?.overrideCode, undefined);
  });
});

describe("conferirXml: os 4 casos reais da rodada de frete legado (fixtures sintéticas, conferência manual confirmada)", () => {
  it("Fabiane (NF-e 1217, R$529,94 = venda): valor bate, sem override, sem bloqueio de valor", () => {
    const outcome = conferirXml({
      expected: { ...MATCHING_EXPECTED, saleTotal: 529.94 },
      xml: parsedXml(NFE_XML_1217_FABIANE),
    });
    assert.ok(!outcome.blocking.some((r) => r.field === "valor"));
    assert.equal(outcome.results.find((r) => r.field === "valor")?.verdict, "OK");
  });

  it("Beatriz (NF-e 1218, R$192,98 = venda): valor bate, sem override, sem bloqueio de valor", () => {
    const outcome = conferirXml({
      expected: { ...MATCHING_EXPECTED, saleTotal: 192.98 },
      xml: parsedXml(NFE_XML_1218_BEATRIZ),
    });
    assert.ok(!outcome.blocking.some((r) => r.field === "valor"));
    assert.equal(outcome.results.find((r) => r.field === "valor")?.verdict, "OK");
  });

  it("Daniela (NF-e 1219, R$169,97 = venda): valor bate, sem override, sem bloqueio de valor", () => {
    const outcome = conferirXml({
      expected: { ...MATCHING_EXPECTED, saleTotal: 169.97 },
      xml: parsedXml(NFE_XML_1219_DANIELA),
    });
    assert.ok(!outcome.blocking.some((r) => r.field === "valor"));
    assert.equal(outcome.results.find((r) => r.field === "valor")?.verdict, "OK");
  });

  it("Tatiane SEM override (NF-e 1220 R$139,99 × venda R$173,99): BLOCKED por valor, igual à tentativa 1 real", () => {
    const outcome = conferirXml({
      expected: { ...MATCHING_EXPECTED, saleTotal: 173.99 },
      xml: parsedXml(NFE_XML_1220_TATIANE),
    });
    assert.equal(outcome.verdict, "BLOCKED");
    assert.ok(outcome.blocking.some((r) => r.field === "valor"));
  });

  it("Tatiane COM override: valor não bloqueia mais (vira Frete legado), bairro continua REVIEW se divergir, nenhum outro campo é beneficiado", () => {
    const outcome = conferirXml({
      expected: { ...MATCHING_EXPECTED, saleTotal: 173.99, legacyFreightOverrideActive: true, address: { ...MATCHING_EXPECTED.address, neighborhood: "Bairro Diferente Da Cliente" } },
      xml: parsedXml(NFE_XML_1220_TATIANE),
    });
    assert.equal(outcome.verdict, "REVIEW");
    assert.ok(!outcome.blocking.some((r) => r.field === "valor"));
    assert.ok(outcome.review.some((r) => r.field === "bairro"));
    const valorResult = outcome.results.find((r) => r.field === "valor");
    assert.equal(valorResult?.overrideCode, "LEGACY_FREIGHT_NOT_INCLUDED_IN_NFE");
    // CPF, rua, número, CEP, cidade, UF, complemento e destinatário continuam
    // batendo (mesma identidade sintética) — o override não "vazou" pra eles.
    for (const field of ["cpf", "destinatario", "rua", "numero", "cep", "cidade", "uf", "complemento"]) {
      const r = outcome.results.find((x) => x.field === field);
      assert.equal(r?.verdict, "OK", `${field} deveria continuar OK`);
      assert.equal(r?.overrideCode, undefined, `${field} nunca deveria ganhar overrideCode`);
    }
  });

  it("Tatiane COM override e SEM nenhuma outra divergência: veredito vira GREEN", () => {
    const outcome = conferirXml({
      expected: { ...MATCHING_EXPECTED, saleTotal: 173.99, legacyFreightOverrideActive: true },
      xml: parsedXml(NFE_XML_1220_TATIANE),
    });
    assert.equal(outcome.verdict, "GREEN");
  });
});

describe("conferirXml: padrão do falso bloqueio real (prefixo de rua) — fixture fictícia, não é a venda real", () => {
  it("cadastro 'ALAGOAS' × XML 'RUA ALAGOAS': rua deixa de divergir, veredito GREEN (nenhuma outra divergência)", () => {
    const outcome = conferirXml({
      expected: { ...MATCHING_EXPECTED, address: { ...MATCHING_EXPECTED.address, street: "ALAGOAS" }, saleTotal: 100 },
      xml: parsedXml(NFE_XML_STREET_PREFIX_CASE),
    });
    assert.equal(outcome.results.find((r) => r.field === "rua")?.verdict, "OK");
    assert.equal(outcome.verdict, "GREEN");
  });

  it("mesmo caso com CEP realmente diferente: rua não bloqueia mais, mas CEP continua BLOCKED (a correção não enfraquece outros campos)", () => {
    const outcome = conferirXml({
      expected: {
        ...MATCHING_EXPECTED,
        address: { ...MATCHING_EXPECTED.address, street: "ALAGOAS", postalCode: "99999999" },
        saleTotal: 100,
      },
      xml: parsedXml(NFE_XML_STREET_PREFIX_CASE),
    });
    assert.equal(outcome.results.find((r) => r.field === "rua")?.verdict, "OK");
    assert.equal(outcome.results.find((r) => r.field === "cep")?.verdict, "BLOCKED");
    assert.equal(outcome.verdict, "BLOCKED");
  });
});

describe("conferir-xml: Fabiane/Beatriz/Daniela — depois da normalização por campo, nenhuma divergência nova nem escondida", () => {
  const CASES: [string, string, number][] = [
    ["Fabiane", NFE_XML_1217_FABIANE, 529.94],
    ["Beatriz", NFE_XML_1218_BEATRIZ, 192.98],
    ["Daniela", NFE_XML_1219_DANIELA, 169.97],
  ];
  for (const [name, xml, saleTotal] of CASES) {
    it(`${name}: endereço idêntico ao XML (Avenida Brasil) continua GREEN, nenhum campo bloqueado ou em revisão`, () => {
      const outcome = conferirXml({ expected: { ...MATCHING_EXPECTED, saleTotal }, xml: parsedXml(xml) });
      assert.equal(outcome.verdict, "GREEN");
      for (const r of outcome.results) assert.equal(r.verdict, "OK", `${name}/${r.field} deveria ser OK`);
    });
  }
});
