// Matriz de equivalência dos normalizadores por campo (address.ts) — conservadora,
// determinística (normalize(A) === normalize(B)), sem Levenshtein/IA/similaridade.
// Cada campo tem sua própria regra fechada; nada aqui aproxima dados realmente
// diferentes.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  normalizeAddressNumber,
  normalizeCep,
  normalizeCity,
  normalizeComplement,
  normalizeNeighborhood,
  normalizePersonName,
  normalizeStreet,
  normalizeUf,
} from "../address.ts";

describe("normalizeStreet — rua/logradouro (causa real do falso bloqueio ALAGOAS × RUA ALAGOAS)", () => {
  it("ALAGOAS × RUA ALAGOAS → equivalentes (o bug relatado)", () => {
    assert.equal(normalizeStreet("ALAGOAS"), normalizeStreet("RUA ALAGOAS"));
  });
  it("ALAGOAS × R ALAGOAS → equivalentes", () => {
    assert.equal(normalizeStreet("ALAGOAS"), normalizeStreet("R ALAGOAS"));
  });
  it("ALAGOAS × R. ALAGOAS → equivalentes", () => {
    assert.equal(normalizeStreet("ALAGOAS"), normalizeStreet("R. ALAGOAS"));
  });
  it("AV BEIJA FLOR × AV. BEIJA FLOR × AVENIDA BEIJA FLOR → todos equivalentes", () => {
    const a = normalizeStreet("AV BEIJA FLOR");
    assert.equal(a, normalizeStreet("AV. BEIJA FLOR"));
    assert.equal(a, normalizeStreet("AVENIDA BEIJA FLOR"));
  });
  it("TV FLORES × TV. FLORES × TRAVESSA FLORES → todos equivalentes", () => {
    const a = normalizeStreet("TV FLORES");
    assert.equal(a, normalizeStreet("TV. FLORES"));
    assert.equal(a, normalizeStreet("TRAVESSA FLORES"));
  });
  it("AL / ALAMEDA e ROD / RODOVIA também equivalem", () => {
    assert.equal(normalizeStreet("AL SANTOS"), normalizeStreet("ALAMEDA SANTOS"));
    assert.equal(normalizeStreet("ROD ANHANGUERA"), normalizeStreet("RODOVIA ANHANGUERA"));
  });
  it("RUA 7 × RUA 9 → divergência (número real diferente, nunca vira igual)", () => {
    assert.notEqual(normalizeStreet("RUA 7"), normalizeStreet("RUA 9"));
  });
  it("ALAGOAS × ALAGOAS II → divergência (sufixo real, nunca vira igual)", () => {
    assert.notEqual(normalizeStreet("ALAGOAS"), normalizeStreet("ALAGOAS II"));
  });
  it("JOSE ALAGOAS × ALAGOAS → divergência (prefixo só conta no COMEÇO; 'JOSE' não é tipo de logradouro)", () => {
    assert.notEqual(normalizeStreet("JOSE ALAGOAS"), normalizeStreet("ALAGOAS"));
  });
  it("tipo de logradouro no meio/fim nunca é removido", () => {
    // "RUA" como segunda palavra não é prefixo — fica como está, então diverge
    // de um valor que não tem essa palavra no meio.
    assert.notEqual(normalizeStreet("AVENIDA RUA NOVA"), normalizeStreet("AVENIDA NOVA"));
  });
  it("'RUA' sozinha (dado incompleto) não vira string vazia", () => {
    assert.equal(normalizeStreet("RUA"), "rua");
  });
  it("Praça continua só canonicalizada (comportamento antigo preservado, sem remoção)", () => {
    assert.equal(normalizeStreet("PC DA SE"), normalizeStreet("PRACA DA SE"));
    assert.notEqual(normalizeStreet("PRACA DA SE"), normalizeStreet("DA SE"));
  });
});

describe("normalizeNeighborhood — bairro", () => {
  it("JD VISTA ALEGRE × JD. VISTA ALEGRE × JARDIM VISTA ALEGRE → equivalentes", () => {
    const a = normalizeNeighborhood("JD VISTA ALEGRE");
    assert.equal(a, normalizeNeighborhood("JD. VISTA ALEGRE"));
    assert.equal(a, normalizeNeighborhood("JARDIM VISTA ALEGRE"));
  });
  it("VL MARIA × VILA MARIA → equivalentes", () => {
    assert.equal(normalizeNeighborhood("VL MARIA"), normalizeNeighborhood("VILA MARIA"));
  });
  it("RES BOA VISTA × RESIDENCIAL BOA VISTA → equivalentes", () => {
    assert.equal(normalizeNeighborhood("RES BOA VISTA"), normalizeNeighborhood("RESIDENCIAL BOA VISTA"));
  });
  it("PQ DAS ARVORES × PARQUE DAS ARVORES → equivalentes", () => {
    assert.equal(normalizeNeighborhood("PQ DAS ARVORES"), normalizeNeighborhood("PARQUE DAS ARVORES"));
  });
  it("JARDIM A × JARDIM B → divergência (nome real diferente)", () => {
    assert.notEqual(normalizeNeighborhood("JARDIM A"), normalizeNeighborhood("JARDIM B"));
  });
  it("JARDIM ALVORADA × ALVORADA → NUNCA vira igual (só o tipo é canonicalizado, nunca removido)", () => {
    assert.notEqual(normalizeNeighborhood("JARDIM ALVORADA"), normalizeNeighborhood("ALVORADA"));
  });
});

describe("normalizeComplement — complemento (texto livre, cada tipo vira forma completa, números/letras preservados)", () => {
  it("AP 225 × AP. 225 × APTO 225 × APARTAMENTO 225 → equivalentes", () => {
    const a = normalizeComplement("AP 225");
    assert.equal(a, normalizeComplement("AP. 225"));
    assert.equal(a, normalizeComplement("APTO 225"));
    assert.equal(a, normalizeComplement("APARTAMENTO 225"));
  });
  it("BL B × BLOCO B → equivalentes", () => {
    assert.equal(normalizeComplement("BL B"), normalizeComplement("BLOCO B"));
  });
  it("SL 2 × SALA 2 → equivalentes", () => {
    assert.equal(normalizeComplement("SL 2"), normalizeComplement("SALA 2"));
  });
  it("CJ / CONJ × CONJUNTO → equivalentes", () => {
    assert.equal(normalizeComplement("CJ 10"), normalizeComplement("CONJUNTO 10"));
    assert.equal(normalizeComplement("CONJ 10"), normalizeComplement("CONJUNTO 10"));
  });
  it("AP 225 × AP 226 → divergência (número real diferente, nunca removido)", () => {
    assert.notEqual(normalizeComplement("AP 225"), normalizeComplement("AP 226"));
  });
  it("BLOCO A × BLOCO B → divergência (letra de bloco nunca removida)", () => {
    assert.notEqual(normalizeComplement("BLOCO A"), normalizeComplement("BLOCO B"));
  });
  it("CASA 2 × CASA 3 → divergência ('casa' não é abreviação da lista, nada muda)", () => {
    assert.notEqual(normalizeComplement("CASA 2"), normalizeComplement("CASA 3"));
  });
  it("APTO 225 BLOCO B (dois tipos na mesma string) canonicaliza os dois", () => {
    assert.equal(normalizeComplement("APTO 225 BL B"), "apartamento 225 bloco b");
  });
});

describe("normalizeComplement — ENTRE AS RUAS X E Y (estrutura fechada, não fuzzy)", () => {
  it("ENTRE AS RUAS 7 E 9 × ENTRE RUA 7 E RUA 9 → equivalentes", () => {
    assert.equal(normalizeComplement("ENTRE AS RUAS 7 E 9"), normalizeComplement("ENTRE RUA 7 E RUA 9"));
  });
  it("as 4 variações aceitas canonicalizam pro mesmo valor", () => {
    const a = normalizeComplement("ENTRE AS RUAS 7 E 9");
    assert.equal(a, normalizeComplement("ENTRE AS RUA 7 E 9"));
    assert.equal(a, normalizeComplement("ENTRE RUA 7 E RUA 9"));
    assert.equal(a, normalizeComplement("ENTRE RUA 7 E 9"));
    assert.equal(a, "entre rua 7 e 9");
  });
  it("ENTRE RUA 7 E 9 × ENTRE RUA 7 E 10 → divergência (número real diferente)", () => {
    assert.notEqual(normalizeComplement("ENTRE RUA 7 E 9"), normalizeComplement("ENTRE RUA 7 E 10"));
  });
  it("ENTRE RUA 7 E 9 × ENTRE RUA 9 E 7 → divergência (ordem nunca é trocada)", () => {
    assert.notEqual(normalizeComplement("ENTRE RUA 7 E 9"), normalizeComplement("ENTRE RUA 9 E 7"));
  });
  it("ENTRE RUA 7 E AVENIDA 9 × ENTRE RUA 7 E RUA 9 → divergência (tipo do segundo referencial é diferente)", () => {
    assert.notEqual(normalizeComplement("ENTRE RUA 7 E AVENIDA 9"), normalizeComplement("ENTRE RUA 7 E RUA 9"));
  });
  it("CASA ENTRE RUA 7 E 9 não sofre transformação estrutural (não começa com ENTRE)", () => {
    assert.equal(normalizeComplement("CASA ENTRE RUA 7 E 9"), "casa entre rua 7 e 9");
    assert.notEqual(normalizeComplement("CASA ENTRE RUA 7 E 9"), normalizeComplement("ENTRE RUA 7 E 9"));
  });
});

describe("normalizeCity — cidade (case/acento/pontuação, sem aproximação entre cidades diferentes)", () => {
  it("SAO PAULO × SÃO PAULO → equivalentes", () => {
    assert.equal(normalizeCity("Sao Paulo"), normalizeCity("São Paulo"));
  });
  it("SANTO ANTONIO × SANTO ANTONIO DE JESUS → divergência (sem abreviação/fuzzy)", () => {
    assert.notEqual(normalizeCity("Santo Antonio"), normalizeCity("Santo Antonio de Jesus"));
  });
});

describe("normalizeUf — estrita, sem aproximação", () => {
  it("sp × SP → equivalentes (só caixa)", () => {
    assert.equal(normalizeUf("sp"), normalizeUf("SP"));
  });
  it("SP × MS → divergência", () => {
    assert.notEqual(normalizeUf("SP"), normalizeUf("MS"));
  });
});

describe("normalizePersonName — nome/destinatário (sem fuzzy, nunca remove sobrenome)", () => {
  it("MARIA DA SILVA × Maria da Silva → equivalentes (só caixa/acento/espaço)", () => {
    assert.equal(normalizePersonName("MARIA DA SILVA"), normalizePersonName("Maria da Silva"));
  });
  it("MARIA DA SILVA × MARIA DA SILVA SOUZA → divergência (sobrenome extra nunca é ignorado)", () => {
    assert.notEqual(normalizePersonName("MARIA DA SILVA"), normalizePersonName("MARIA DA SILVA SOUZA"));
  });
});

describe("normalizeAddressNumber — número (sem regra de zero à esquerda nem S/N: sem evidência real que justifique)", () => {
  it("145 × 154 → divergência (número real diferente)", () => {
    assert.notEqual(normalizeAddressNumber("145"), normalizeAddressNumber("154"));
  });
  it("125 × 125  (espaço/pontuação irrelevante) → equivalentes", () => {
    assert.equal(normalizeAddressNumber("125"), normalizeAddressNumber(" 125 "));
  });
});

describe("normalizeCep — só dígitos, comparação exata (sem mudança de comportamento)", () => {
  it("02877-040 × 02877040 → equivalentes", () => {
    assert.equal(normalizeCep("02877-040"), normalizeCep("02877040"));
  });
  it("um dígito diferente → divergência", () => {
    assert.notEqual(normalizeCep("02877-040"), normalizeCep("02877-041"));
  });
});
