import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatInternalCode, parseInternalCodeSearchTerm } from "../internal-code.ts";

describe("formatInternalCode", () => {
  it("preenche com zeros à esquerda até 8 dígitos", () => {
    assert.equal(formatInternalCode(580), "00000580");
    assert.equal(formatInternalCode(1), "00000001");
    assert.equal(formatInternalCode(579), "00000579");
  });

  it("aceita string numérica", () => {
    assert.equal(formatInternalCode("580"), "00000580");
  });

  it("não trunca valores com 8+ dígitos", () => {
    assert.equal(formatInternalCode(123456789), "123456789");
    assert.equal(formatInternalCode(99999999), "99999999");
  });
});

describe("parseInternalCodeSearchTerm", () => {
  it("aceita dígitos puros, com ou sem zeros à esquerda, devolvendo o mesmo inteiro", () => {
    assert.equal(parseInternalCodeSearchTerm("580"), 580);
    assert.equal(parseInternalCodeSearchTerm("00000580"), 580);
    assert.equal(parseInternalCodeSearchTerm("0580"), 580);
  });

  it("aceita espaços nas pontas", () => {
    assert.equal(parseInternalCodeSearchTerm("  580  "), 580);
  });

  it("rejeita texto não numérico (nome, código legado alfanumérico)", () => {
    assert.equal(parseInternalCodeSearchTerm("calça"), null);
    assert.equal(parseInternalCodeSearchTerm("MF-7284"), null);
    assert.equal(parseInternalCodeSearchTerm("10000011a"), null);
  });

  it("um código legado puramente numérico também normaliza (a busca combina os dois campos)", () => {
    assert.equal(parseInternalCodeSearchTerm("479"), 479);
  });

  it("rejeita vazio e zero", () => {
    assert.equal(parseInternalCodeSearchTerm(""), null);
    assert.equal(parseInternalCodeSearchTerm("   "), null);
    assert.equal(parseInternalCodeSearchTerm("0"), null);
    assert.equal(parseInternalCodeSearchTerm("00000000"), null);
  });
});
