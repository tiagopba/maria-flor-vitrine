import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { documentAvailability, documentPathFor } from "../documents.ts";

describe("documentAvailability: PDF_UPLOAD (DANFE + etiqueta)", () => {
  it("os dois presentes: danfe e label true, xml sempre false", () => {
    const result = documentAvailability({
      record_source: "PDF_UPLOAD",
      danfe_file_path: "a/danfe.pdf",
      label_file_path: "a/label.pdf",
      xml_file_path: null,
    });
    assert.deepEqual(result, { danfe: true, label: true, xml: false, any: true });
  });

  it("documentPathFor devolve o path certo para danfe/etiqueta, null para xml", () => {
    const record = {
      record_source: "PDF_UPLOAD" as const,
      danfe_file_path: "a/danfe.pdf",
      label_file_path: "a/label.pdf",
      xml_file_path: null,
    };
    assert.equal(documentPathFor(record, "danfe"), "a/danfe.pdf");
    assert.equal(documentPathFor(record, "etiqueta"), "a/label.pdf");
    assert.equal(documentPathFor(record, "xml"), null);
  });
});

describe("documentAvailability: HISTORICAL_IMPORT (planilha antiga, sem documento)", () => {
  it("nenhum documento: tudo false, mesmo que algum path viesse preenchido por engano", () => {
    const result = documentAvailability({
      record_source: "HISTORICAL_IMPORT",
      danfe_file_path: null,
      label_file_path: null,
      xml_file_path: null,
    });
    assert.deepEqual(result, { danfe: false, label: false, xml: false, any: false });
  });

  it("nunca é tratado como XML_UPLOAD mesmo se xml_file_path viesse preenchido (a origem decide, não só o path)", () => {
    const result = documentAvailability({
      record_source: "HISTORICAL_IMPORT",
      danfe_file_path: null,
      label_file_path: null,
      xml_file_path: "nao deveria existir, mas se existir não vira XML_UPLOAD",
    });
    assert.equal(result.xml, false);
  });
});

describe("documentAvailability: XML_UPLOAD (fluxo novo, XML da NF-e)", () => {
  it("xml presente: xml true, danfe/label sempre false (nunca exige DANFE nem etiqueta)", () => {
    const result = documentAvailability({
      record_source: "XML_UPLOAD",
      danfe_file_path: null,
      label_file_path: null,
      xml_file_path: "intakes/x/attempt-1/nfe.xml",
    });
    assert.deepEqual(result, { danfe: false, label: false, xml: true, any: true });
  });

  it("documentPathFor devolve o path do xml, nunca danfe/etiqueta (mesmo que viessem preenchidos por engano)", () => {
    const record = {
      record_source: "XML_UPLOAD" as const,
      danfe_file_path: "nao deveria existir",
      label_file_path: "nao deveria existir",
      xml_file_path: "intakes/x/attempt-1/nfe.xml",
    };
    assert.equal(documentPathFor(record, "xml"), "intakes/x/attempt-1/nfe.xml");
    // A origem decide o rótulo exibido na tela (RecordDetailView), não documentPathFor —
    // mas danfe/etiqueta continuam tecnicamente consultáveis se o path existir; o que
    // documentAvailability garante é que a UI nunca MOSTRA botão de DANFE/etiqueta aqui.
    assert.equal(documentAvailability(record).danfe, false);
    assert.equal(documentAvailability(record).label, false);
  });

  it("sem xml_file_path (não deveria acontecer — constraint no banco impede — mas a função nunca inventa disponibilidade)", () => {
    const result = documentAvailability({
      record_source: "XML_UPLOAD",
      danfe_file_path: null,
      label_file_path: null,
      xml_file_path: null,
    });
    assert.deepEqual(result, { danfe: false, label: false, xml: false, any: false });
  });
});
