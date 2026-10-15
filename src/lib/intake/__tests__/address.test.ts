import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { compareAddress, normalizeComplement, normalizeStreet, type AddressInput } from "../address.ts";

describe("normalizeStreet: prefixo de logradouro não é parte do nome da rua", () => {
  it("'Rua Exemplo' e 'Exemplo' normalizam igual — bug real: cliente digita só o nome, XML sempre vem com o prefixo", () => {
    assert.equal(normalizeStreet("Rua Exemplo"), normalizeStreet("Exemplo"));
    assert.equal(normalizeStreet("Exemplo"), "exemplo");
    assert.equal(normalizeStreet("Rua Exemplo"), "exemplo");
  });

  it("funciona para os outros prefixos de logradouro (abreviados ou por extenso)", () => {
    assert.equal(normalizeStreet("Avenida Brasil"), normalizeStreet("Brasil"));
    assert.equal(normalizeStreet("Av Brasil"), normalizeStreet("Brasil")); // abreviação expande e depois o prefixo some
    assert.equal(normalizeStreet("Alameda das Flores"), normalizeStreet("das Flores"));
  });

  it("nunca esvazia uma rua cujo nome de verdade é só o prefixo (caso extremo)", () => {
    assert.equal(normalizeStreet("Rua"), "rua");
  });

  it("rua genuinamente diferente continua diferente, prefixo ou não", () => {
    assert.notEqual(normalizeStreet("Rua Exemplo"), normalizeStreet("Rua Outra"));
    assert.notEqual(normalizeStreet("Exemplo"), normalizeStreet("Outra"));
  });
});

// Dados 100% sintéticos (nenhum dado real de cliente) — reproduz a MESMA forma
// do bug real que motivou a correção: cliente digita só o nome da rua no
// formulário público, XML da NF-e vem com o prefixo de logradouro completo;
// complemento com plural/pontuação levemente diferente entre os dois.
describe("compareAddress: mesma forma do bug real (dados sintéticos)", () => {
  const expected: AddressInput = {
    street: "Exemplo",
    number: "100",
    complement: "Entre as ruas 7 e 9",
    neighborhood: "Jardim Exemplo",
    city: "Cidade Exemplo",
    state: "MS",
    postalCode: "79500000",
  };
  const xml: AddressInput = {
    street: "Rua Exemplo",
    number: "100",
    complement: "ENTRE RUA 7 E RUA 9",
    neighborhood: "Jardim Exemplo",
    city: "Cidade Exemplo",
    state: "MS",
    postalCode: "79500000",
  };

  it("rua: OK agora (antes do fix dava BLOCKED só pela falta do prefixo 'Rua')", () => {
    const results = compareAddress(expected, xml);
    const rua = results.find((r) => r.field === "rua");
    assert.equal(rua?.verdict, "OK");
  });

  it("número, bairro, cidade, UF e CEP iguais: tudo OK", () => {
    const results = compareAddress(expected, xml);
    for (const field of ["numero", "cep", "cidade", "uf"]) {
      const r = results.find((x) => x.field === field);
      assert.equal(r?.verdict, "OK", field);
    }
  });

  it("complemento: OK — 'Entre as ruas 7 e 9' e 'ENTRE RUA 7 E RUA 9' são a mesma estrutura (artigo + plural × repetição), não uma diferença real", () => {
    const results = compareAddress(expected, xml);
    const complemento = results.find((r) => r.field === "complemento");
    assert.equal(complemento?.verdict, "OK");
  });

  it("nenhum campo fica BLOCKED nem REVIEW neste caso — endereço e complemento batem de verdade", () => {
    const results = compareAddress(expected, xml);
    assert.equal(results.filter((r) => r.verdict === "BLOCKED").length, 0);
    assert.equal(results.filter((r) => r.verdict === "REVIEW").length, 0);
  });
});

describe("normalizeComplement: só estrutura segura (artigo, plural, repetição do logradouro) — nunca fuzzy matching amplo", () => {
  it("caso real: artigo 'as' + plural 'ruas' × repetição de 'rua' antes do segundo número", () => {
    assert.equal(normalizeComplement("Entre as ruas 7 e 9"), normalizeComplement("ENTRE RUA 7 E RUA 9"));
    assert.equal(normalizeComplement("ENTRE RUA 7 E RUA 9"), "entre rua 7 e rua 9");
  });

  it("variações de artigo (a/as/o/os) antes de rua/ruas também equivalem", () => {
    assert.equal(normalizeComplement("Entre a rua 7 e a rua 9"), "entre rua 7 e rua 9");
    assert.equal(normalizeComplement("Entre as ruas 7 e 9"), "entre rua 7 e rua 9");
    assert.equal(normalizeComplement("Entre ruas 7 e 9"), "entre rua 7 e rua 9");
  });

  it("já na forma canônica: idempotente, não mexe de novo", () => {
    assert.equal(normalizeComplement("Entre rua 7 e rua 9"), "entre rua 7 e rua 9");
  });

  it("acento, caixa e pontuação continuam normalizados como antes", () => {
    assert.equal(normalizeComplement("Entre, as Ruas 7 e 9!"), "entre rua 7 e rua 9");
  });

  it("NEGATIVO: número realmente diferente nunca vira igual", () => {
    assert.notEqual(normalizeComplement("Entre as ruas 7 e 9"), normalizeComplement("Entre rua 7 e rua 10"));
  });

  it("NEGATIVO: segundo logradouro de tipo diferente (avenida, não rua) nunca vira igual", () => {
    assert.notEqual(normalizeComplement("Entre rua 7 e avenida 9"), normalizeComplement("Entre rua 7 e rua 9"));
  });

  it("NEGATIVO: complemento sem nenhuma relação com 'rua' passa intocado (sem interferência deste normalizador)", () => {
    assert.equal(normalizeComplement("Apto 12 B"), "apto 12 b");
    assert.equal(normalizeComplement("Fundos, casa 2"), "fundos casa 2");
  });

  it("NEGATIVO: texto realmente diferente continua diferente (não é fuzzy matching amplo)", () => {
    assert.notEqual(normalizeComplement("Entre rua 7 e rua 9"), normalizeComplement("Próximo ao mercado"));
  });
});

describe("compareAddress: complemento com diferença REAL continua REVIEW (a correção não virou fuzzy matching)", () => {
  const base: AddressInput = {
    street: "Exemplo",
    number: "100",
    complement: "Entre as ruas 7 e 9",
    neighborhood: "Jardim Exemplo",
    city: "Cidade Exemplo",
    state: "MS",
    postalCode: "79500000",
  };

  it("número do segundo logradouro realmente diferente (9 × 10) continua REVIEW", () => {
    const results = compareAddress(base, { ...base, complement: "ENTRE RUA 7 E RUA 10" });
    const complemento = results.find((r) => r.field === "complemento");
    assert.equal(complemento?.verdict, "REVIEW");
  });

  it("complemento sem nenhuma relação (ex.: 'Apto 12 B' × endereço sem complemento no XML) continua REVIEW", () => {
    const results = compareAddress({ ...base, complement: "Apto 12 B" }, { ...base, complement: "Fundos" });
    const complemento = results.find((r) => r.field === "complemento");
    assert.equal(complemento?.verdict, "REVIEW");
  });
});
