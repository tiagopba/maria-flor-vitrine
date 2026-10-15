import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");

const CONF = "src/app/admin/faturamento-envios/pre/[id]/conferencia-actions.ts";
const PANEL = "src/app/admin/faturamento-envios/pre/[id]/ConferenciaPanel.tsx";

describe("XML-only: nova intake não exige mais DANFE nem etiqueta em PDF", () => {
  it("a action de iniciar conferência não lê mais 'danfe' nem 'label' do formulário", () => {
    const src = read(CONF);
    assert.doesNotMatch(src, /formData\.get\("danfe"\)/);
    assert.doesNotMatch(src, /formData\.get\("label"\)/);
    assert.match(src, /formData\.get\("xml"\)/);
  });

  it("não usa mais os parsers de PDF (DANFE/etiqueta) nem extração de texto de PDF", () => {
    const src = read(CONF);
    assert.doesNotMatch(src, /parseDanfeSimplificado|parseShippingLabel|extractPdfText/);
  });

  it("o upload do XML é um único arquivo .xml, não dois PDFs", () => {
    const src = read(CONF);
    assert.match(src, /\.name\.toLowerCase\(\)\.endsWith\(\"\.xml\"\)/);
  });

  it("o formulário mostra só o campo de XML — nada de DANFE/etiqueta em PDF", () => {
    const src = read(PANEL);
    assert.doesNotMatch(src, /name="danfe"|name="label"/);
    assert.match(src, /name="xml"/);
    assert.match(src, /CONFERÊNCIA/i);
  });
});

describe("XML-only: fluxo histórico (DANFE + etiqueta) continua válido e intocado", () => {
  it("conferir.ts, parse-danfe.ts e parse-label.ts (usados pelo Cadastro manual) não foram removidos nem alterados", () => {
    // Cadastro manual (src/app/admin/faturamento-envios/novo) continua no fluxo PDF —
    // fora do escopo desta mudança, que é só sobre a intake (Nova Venda).
    assert.doesNotThrow(() => read("src/lib/intake/conferir.ts"));
    assert.doesNotThrow(() => read("src/lib/fulfillment/parse-danfe.ts"));
    assert.doesNotThrow(() => read("src/lib/fulfillment/parse-label.ts"));
  });

  it("Cadastro manual (fulfillment.ts/createFulfillmentRecord) continua exigindo os dois PDFs, sem XML", () => {
    const src = read("src/lib/db/fulfillment.ts");
    assert.match(src, /danfe: Uint8Array;/);
    assert.match(src, /label: Uint8Array;/);
  });
});

describe("Conferência bloqueada: CONFIRMAR CONFERÊNCIA nunca fica ativo nem visível", () => {
  it("o botão só é renderizado quando NÃO está bloqueado (!isBlocked)", () => {
    const src = read(PANEL);
    assert.match(src, /\{!isBlocked && \(/);
    const blockIdx = src.indexOf("{!isBlocked && (");
    const buttonIdx = src.indexOf("CONFIRMAR CONFERÊNCIA");
    assert.ok(blockIdx > -1 && buttonIdx > blockIdx, "o botão precisa estar dentro do bloco condicional !isBlocked");
  });

  it("o aviso vermelho de bloqueio já orienta a corrigir/recomeçar, sem depender do botão desabilitado", () => {
    const src = read(PANEL);
    assert.match(src, /CONFERÊNCIA BLOQUEADA/);
    assert.match(src, /Recomece com o XML correto ou corrija os dados da cliente/);
  });
});

describe("Upload do XML: área destacada, feedback de arquivo e erro, submit só com arquivo válido", () => {
  it("dropzone com ícone, texto grande e texto auxiliar", () => {
    const src = read(PANEL);
    assert.match(src, /border-dashed/);
    assert.match(src, /Clique para selecionar o XML da NF-e/);
    assert.match(src, /Arquivo \.xml, até 2 MB/);
  });

  it("aceita só .xml e valida a extensão no cliente antes de habilitar o envio", () => {
    const src = read(PANEL);
    assert.match(src, /accept=".xml,application\/xml,text\/xml"/);
    assert.match(src, /\.name\.toLowerCase\(\)\.endsWith\(\"\.xml\"\)/);
  });

  it("mostra o nome do arquivo selecionado e um jeito de removê-lo", () => {
    const src = read(PANEL);
    assert.match(src, /selectedFile\.name/);
    assert.match(src, /onClick=\{clearFile\}/);
  });

  it("estado de erro aparece logo abaixo do campo, nunca escondido", () => {
    const src = read(PANEL);
    assert.match(src, /fileError/);
    assert.match(src, /role="alert"/);
  });

  it("botão principal do upload só habilita com arquivo selecionado", () => {
    const src = read(PANEL);
    assert.match(src, /disabled=\{pending \|\| !selectedFile\}/);
  });
});
