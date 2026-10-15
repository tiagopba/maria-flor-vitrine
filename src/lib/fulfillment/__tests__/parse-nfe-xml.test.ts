import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseNfeXml, type NfeXmlData } from "../parse-nfe-xml.ts";
import { NFE_KEY_1215, NFE_XML_1215 } from "./fixtures.ts";

describe("parseNfeXml: XML válido (caso que originou a correção, anonimizado)", () => {
  it("extrai identificação fiscal, destinatário, endereço, valor e transportadora", () => {
    const result = parseNfeXml(NFE_XML_1215);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.nfeNumber, "1215");
    assert.equal(result.data.nfeSeries, "1");
    assert.equal(result.data.nfeKey, NFE_KEY_1215);
    assert.equal(result.data.protocolStatus, "100");
    assert.equal(result.data.recipientDocument, "11144477735");
    assert.equal(result.data.recipientName, "MARIA DA SILVA EXEMPLO");
    assert.equal(result.data.addressLine, "Avenida Brasil");
    assert.equal(result.data.addressNumber, "1500");
    assert.equal(result.data.addressComplement, "APTO 12 B");
    assert.equal(result.data.neighborhood, "Jardim das Palmeiras");
    assert.equal(result.data.city, "Sao Paulo");
    assert.equal(result.data.state, "SP");
    assert.equal(result.data.postalCode, "01310100");
    assert.equal(result.data.invoiceTotal, 334.97);
    assert.equal(result.data.carrierNameRaw, "J&T EXPRESS LOGISTICA LTDA");
  });
});

describe("parseNfeXml: XML malformado", () => {
  it("XML com tag não fechada é recusado, não derruba o parser", () => {
    const broken = NFE_XML_1215.replace("</nfeProc>", "");
    const result = parseNfeXml(broken);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /malformado/i);
  });

  it("texto que não é XML nenhum é recusado", () => {
    const result = parseNfeXml("isto não é um XML");
    assert.equal(result.ok, false);
  });
});

describe("parseNfeXml: estrutura não suportada", () => {
  it("XML bem formado mas sem nfeProc na raiz (ex.: só a NFe solta) é recusado", () => {
    // Bem formado de propósito (um único root diferente), para isolar esta checagem
    // estrutural da checagem de "XML malformado" (testada separadamente acima).
    const withoutProc = NFE_XML_1215.replace(/<\?xml[^>]*\?>\s*/, "")
      .replace(/<nfeProc[^>]*>/, "<outraRaiz>")
      .replace("</nfeProc>", "</outraRaiz>");
    const result = parseNfeXml(withoutProc);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /nfeProc/i);
  });

  it("XML sem protNFe (sem protocolo de autorização) é recusado", () => {
    const withoutProt = NFE_XML_1215.replace(/<protNFe[\s\S]*<\/protNFe>/, "");
    const result = parseNfeXml(withoutProt);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /protocolo/i);
  });
});

describe("parseNfeXml: NF-e não autorizada (cStat)", () => {
  it("cStat diferente de 100 é recusado", () => {
    const denied = NFE_XML_1215.replace("<cStat>100</cStat>", "<cStat>110</cStat>");
    const result = parseNfeXml(denied);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /não autorizada/i);
  });

  it("cStat ausente também é recusado (nunca assume autorizado por omissão)", () => {
    const missing = NFE_XML_1215.replace("<cStat>100</cStat>", "");
    const result = parseNfeXml(missing);
    assert.equal(result.ok, false);
  });
});

describe("parseNfeXml: chave de acesso", () => {
  it("chave divergente entre infNFe/@Id e protNFe/infProt/chNFe é recusada", () => {
    const otherKey = "99999999999999999999999999999999999999999999".slice(0, 44);
    const divergent = NFE_XML_1215.replace(`<chNFe>${NFE_KEY_1215}</chNFe>`, `<chNFe>${otherKey}</chNFe>`);
    const result = parseNfeXml(divergent);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /divergente/i);
  });

  it("chave com menos de 44 dígitos é recusada, mesmo batendo nos dois lugares", () => {
    const shortKey = "123456789";
    const invalid = NFE_XML_1215.replace(new RegExp(NFE_KEY_1215, "g"), shortKey);
    const result = parseNfeXml(invalid);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /44 dígitos/i);
  });

  it("infNFe/@Id ausente é recusado", () => {
    const noId = NFE_XML_1215.replace(` Id="NFe${NFE_KEY_1215}"`, "");
    const result = parseNfeXml(noId);
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /chave de acesso não encontrada/i);
  });

  it("chNFe ausente no protocolo é recusado", () => {
    const noChNFe = NFE_XML_1215.replace(`<chNFe>${NFE_KEY_1215}</chNFe>`, "");
    const result = parseNfeXml(noChNFe);
    assert.equal(result.ok, false);
  });
});

describe("parseNfeXml: transportadora", () => {
  it("ausente (sem transp/transporta): carrierNameRaw null, não bloqueia o parse", () => {
    const noCarrier = NFE_XML_1215.replace(/<transp>[\s\S]*<\/transp>/, "");
    const result = parseNfeXml(noCarrier);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.carrierNameRaw, null);
  });

  it("presente: devolve o texto bruto do XML (normalização de carrier é responsabilidade do CONFERE GERAL, não do parser)", () => {
    const result = parseNfeXml(NFE_XML_1215);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.carrierNameRaw, "J&T EXPRESS LOGISTICA LTDA");
  });
});

describe("parseNfeXml: campos individuais do destinatário/endereço/valor", () => {
  const cases: [keyof NfeXmlData, string, string, string][] = [
    ["recipientDocument", "<CPF>11144477735</CPF>", "<CPF>22233344405</CPF>", "22233344405"],
    ["addressLine", "<xLgr>Avenida Brasil</xLgr>", "<xLgr>Rua Nova</xLgr>", "Rua Nova"],
    ["addressNumber", "<nro>1500</nro>", "<nro>42</nro>", "42"],
    ["addressComplement", "<xCpl>APTO 12 B</xCpl>", "<xCpl>FUNDOS</xCpl>", "FUNDOS"],
    ["neighborhood", "<xBairro>Jardim das Palmeiras</xBairro>", "<xBairro>Centro</xBairro>", "Centro"],
    ["postalCode", "<CEP>01310100</CEP>", "<CEP>79500000</CEP>", "79500000"],
    ["city", "<xMun>Sao Paulo</xMun>", "<xMun>Campo Grande</xMun>", "Campo Grande"],
    ["state", "<UF>SP</UF>", "<UF>MS</UF>", "MS"],
  ];

  for (const [field, from, to, expected] of cases) {
    it(`${field}: ${from} → ${to}`, () => {
      const xml = NFE_XML_1215.replace(from, to);
      const result = parseNfeXml(xml);
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.data[field], expected);
    });
  }

  it("CPF: extrai só dígitos, mesmo que o XML viesse com máscara (não deveria, mas não quebra)", () => {
    const masked = NFE_XML_1215.replace("<CPF>11144477735</CPF>", "<CPF>111.444.777-35</CPF>");
    const result = parseNfeXml(masked);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.recipientDocument, "11144477735");
  });

  it("vNF: número com casas decimais vira number, nunca string", () => {
    const result = parseNfeXml(NFE_XML_1215.replace("<vNF>334.97</vNF>", "<vNF>1234.56</vNF>"));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.invoiceTotal, 1234.56);
  });

  it("vNF ausente: invoiceTotal null, não derruba o parser nem inventa 0", () => {
    const noValue = NFE_XML_1215.replace("<vNF>334.97</vNF>", "");
    const result = parseNfeXml(noValue);
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.data.invoiceTotal, null);
  });
});
