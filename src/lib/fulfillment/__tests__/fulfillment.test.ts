import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareDocuments, mergeToFormValues } from "../compare.ts";
import { parseDanfeSimplificado } from "../parse-danfe.ts";
import { parseShippingLabel } from "../parse-label.ts";
import { formatCpfCnpj, maskCpfCnpj, normalizeForCompare, parseBrazilianMoney, stripLeadingZeros } from "../text.ts";
import { DANFE_TEXT, LABEL_CORREIOS_TEXT, LABEL_TEXT, NFE_KEY } from "./fixtures.ts";

describe("parseDanfeSimplificado", () => {
  const danfe = parseDanfeSimplificado(DANFE_TEXT);

  it("lê cliente (nome e CPF) e ignora o CNPJ do emitente", () => {
    assert.equal(danfe.customerName, "MARIA DA SILVA EXEMPLO");
    assert.equal(danfe.customerDocument, "11144477735");
  });

  it("separa endereço, número, complemento, bairro, cidade e UF", () => {
    assert.equal(danfe.addressLine, "Avenida Brasil");
    assert.equal(danfe.addressNumber, "1500");
    assert.equal(danfe.addressComplement, "APTO 12 B");
    assert.equal(danfe.neighborhood, "Jardim das Palmeiras");
    assert.equal(danfe.city, "Sao Paulo");
    assert.equal(danfe.state, "SP");
  });

  it("lê dados fiscais", () => {
    assert.equal(danfe.nfeNumber, "123");
    assert.equal(danfe.nfeSeries, "2");
    assert.equal(danfe.nfeKey, NFE_KEY);
    assert.equal(danfe.nfeProtocol, "150260000000001");
    assert.equal(danfe.nfeIssuedAt, "2026-10-02");
    assert.equal(danfe.itemsCount, 3);
    assert.equal(danfe.invoiceTotal, 1139.9);
  });

  it("não inventa CEP quando a DANFE não traz", () => {
    assert.equal(danfe.postalCode, null);
  });

  it("endereço sem complemento: logradouro, número, bairro", () => {
    const parsed = parseDanfeSimplificado(
      "CONSUMIDOR\nCNPJ/CPF/ID Estrangeiro: 111.444.777-35 ANA\nRua A, 10, Centro - Campo Grande - MS"
    );
    assert.equal(parsed.addressLine, "Rua A");
    assert.equal(parsed.addressNumber, "10");
    assert.equal(parsed.addressComplement, null);
    assert.equal(parsed.neighborhood, "Centro");
    assert.equal(parsed.city, "Campo Grande");
  });

  it("texto vazio ou sem estrutura devolve tudo null", () => {
    for (const text of ["", "qualquer coisa sem nada reconhecível"]) {
      const parsed = parseDanfeSimplificado(text);
      assert.ok(Object.values(parsed).every((value) => value === null));
    }
  });
});

describe("parseShippingLabel", () => {
  const label = parseShippingLabel(LABEL_TEXT);

  it("lê destinatário e endereço", () => {
    assert.equal(label.recipientName, "MARIA DA SILVA EXEMPLO");
    assert.equal(label.addressStreet, "Avenida Brasil");
    assert.equal(label.addressNumber, "1500");
    assert.equal(label.addressRemainder, "JARDIM DAS PALMEIRAS APTO 12 B");
  });

  it("lê CEP, cidade, UF e data/hora", () => {
    assert.equal(label.postalCode, "01310100");
    assert.equal(label.city, "São Paulo");
    assert.equal(label.state, "SP");
    assert.equal(label.labelDateTime, "2026-10-05T11:05:26");
  });

  it("escolhe o código repetido como rastreio (não o CEP nem o código de rota)", () => {
    assert.equal(label.trackingCode, "888100009999999");
  });

  it("não inventa transportadora quando só há logo (imagem)", () => {
    assert.equal(label.carrier, null);
  });

  it("reconhece rastreio e transportadora dos Correios", () => {
    const correios = parseShippingLabel(LABEL_CORREIOS_TEXT);
    assert.equal(correios.trackingCode, "PR123456789BR");
    assert.equal(correios.carrier, "Correios");
    assert.equal(correios.postalCode, "79500000");
    assert.equal(correios.labelDateTime, "2026-10-05T00:00:00");
  });

  it("texto vazio devolve tudo null", () => {
    assert.ok(Object.values(parseShippingLabel("")).every((value) => value === null));
  });
});

describe("compareDocuments", () => {
  const danfe = parseDanfeSimplificado(DANFE_TEXT);
  const label = parseShippingLabel(LABEL_TEXT);

  it("ignora acento/caixa e marca como mesmo envio", () => {
    const result = compareDocuments(danfe, label);
    assert.equal(result.overall, "match");
    assert.equal(result.fields.find((f) => f.key === "city")?.status, "match");
    assert.equal(result.fields.find((f) => f.key === "postalCode")?.status, "unavailable");
  });

  it("aponta exatamente os campos divergentes", () => {
    const other = { ...label, recipientName: "CARLOS OUTRO", city: "Campinas", addressNumber: "99" };
    const result = compareDocuments(danfe, other);
    assert.equal(result.overall, "mismatch");
    const mismatched = result.fields.filter((f) => f.status === "mismatch").map((f) => f.key);
    assert.deepEqual(mismatched.sort(), ["address", "city", "name"]);
  });

  it("tolera abreviação de logradouro e nome truncado", () => {
    const abbreviated = { ...label, addressStreet: "Av. Brasil", recipientName: "MARIA EXEMPLO" };
    const result = compareDocuments(danfe, abbreviated);
    assert.equal(result.overall, "match");
  });

  it("só um documento legível = comparação incompleta", () => {
    assert.equal(compareDocuments(danfe, null).overall, "incomplete");
    assert.equal(compareDocuments(null, label).overall, "incomplete");
  });
});

describe("mergeToFormValues", () => {
  it("combina os dois documentos nos campos do formulário", () => {
    const form = mergeToFormValues(parseDanfeSimplificado(DANFE_TEXT), parseShippingLabel(LABEL_TEXT));
    assert.equal(form.customerName, "MARIA DA SILVA EXEMPLO");
    assert.equal(form.postalCode, "01310100");
    assert.equal(form.trackingCode, "888100009999999");
    assert.equal(form.invoiceTotal, "1139,90");
    assert.equal(form.shippingLabelDate, "2026-10-05T11:05");
  });

  it("só a etiqueta: preenche o que achou e deixa bairro/complemento para o funcionário", () => {
    const form = mergeToFormValues(null, parseShippingLabel(LABEL_TEXT));
    assert.equal(form.customerName, "MARIA DA SILVA EXEMPLO");
    assert.equal(form.addressLine, "Avenida Brasil");
    assert.equal(form.neighborhood, "");
    assert.equal(form.nfeNumber, "");
  });
});

describe("text helpers", () => {
  it("normaliza caixa, acentos, pontuação e espaços", () => {
    assert.equal(normalizeForCompare("  São   Paulo, (SP)! "), "sao paulo sp");
  });

  it("mascara CPF mostrando só os 2 últimos dígitos", () => {
    assert.equal(maskCpfCnpj("11144477735"), "***.***.***-35");
    assert.equal(formatCpfCnpj("11144477735"), "111.444.777-35");
  });

  it("valores monetários e zeros à esquerda", () => {
    assert.equal(parseBrazilianMoney("1.139,99"), 1139.99);
    assert.equal(parseBrazilianMoney("abc"), null);
    assert.equal(stripLeadingZeros("000006"), "6");
    assert.equal(stripLeadingZeros("000"), "0");
  });
});
