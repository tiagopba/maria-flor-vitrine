import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldLabel } from "../labels.ts";

describe("nomes de campo da conferência", () => {
  it("traduz campos e a origem (NF-e, etiqueta, NF × etiqueta)", () => {
    assert.equal(fieldLabel("cpf"), "CPF");
    assert.equal(fieldLabel("nf_numero"), "NF-e: Número");
    assert.equal(fieldLabel("etiqueta_cep"), "Etiqueta: CEP");
    assert.equal(fieldLabel("nf_vs_etiqueta_cidade"), "NF-e × etiqueta: Cidade");
    assert.equal(fieldLabel("valor"), "Valor");
  });

  it("campo desconhecido volta como veio (sem inventar)", () => {
    assert.equal(fieldLabel("campo_novo"), "campo_novo");
  });
});
