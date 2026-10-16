// Comparação de endereço para o CONFERE GERAL — PURO.
// Regra: só abreviações de uma LISTA FECHADA são equivalentes. Nada de fuzzy matching:
// ruas realmente diferentes nunca viram iguais.

/** NOT_COMPARABLE: o documento não traz o dado de forma confiável; não é erro nem aviso. */
export type FieldVerdict = "OK" | "REVIEW" | "BLOCKED" | "NOT_COMPARABLE";

export interface FieldResult {
  field: string;
  verdict: FieldVerdict;
  reason: string;
  /**
   * Só presente quando um override explícito e auditável (ex.: frete legado,
   * ver fulfillment_intake_legacy_overrides) mudou um veredito que por
   * padrão seria BLOCKED — nunca setado numa comparação normal. A UI usa
   * isto pra mostrar o aviso de forma informativa, nunca pra decidir nada
   * sozinha (a decisão real já está no `verdict`).
   */
  overrideCode?: string;
}

const DIACRITICS = /[̀-ͯ]/g;

/**
 * Base de todo normalizador de comparação: caixa, acentos, pontuação e
 * espaços saem. NUNCA usada para alterar o que é gravado ou exibido — só
 * para decidir se dois valores "são a mesma informação escrita diferente".
 * Já cobre sozinha os campos que não precisam de regra própria (cidade,
 * nome/destinatário — ver normalizeCity/normalizePersonName abaixo).
 */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * RUA/LOGRADOURO — causa real do falso bloqueio "ALAGOAS" (cadastro) ×
 * "RUA ALAGOAS" (XML): a normalização antiga só CANONICALIZAVA abreviação
 * pra forma completa (ex.: "r" → "rua"), nunca REMOVIA o tipo quando só um
 * dos dois lados tinha prefixo — "alagoas" nunca virava igual a "rua
 * alagoas". Correção: remove o tipo de logradouro SÓ quando é a primeira
 * palavra (nunca no meio/fim — "JOSE ALAGOAS" não vira "ALAGOAS", "ALAGOAS
 * II" não vira "ALAGOAS"). Lista fechada por decisão do usuário; "ESTR"
 * (variante de estrada) não entrou — auditoria em Production (leitura, ver
 * handoff) não achou nenhum endereço real usando essa forma.
 */
const STREET_TYPE_PREFIXES = new Set([
  "r",
  "rua",
  "av",
  "avenida",
  "trav",
  "tv",
  "travessa",
  "al",
  "alameda",
  "rod",
  "rodovia",
  "est",
  "estrada",
]);

/** Fora do tipo de logradouro (nunca removido, só canonicalizado) — comportamento já existente, preservado. */
const STREET_WORD_CANONICAL: Record<string, string> = {
  pc: "praca",
  pca: "praca",
  praca: "praca",
};

export function normalizeStreet(value: string | null | undefined): string {
  const tokens = normalizeText(value).split(" ").filter(Boolean);
  // tokens.length > 1 evita reduzir "RUA" sozinha (dado incompleto) a "".
  if (tokens.length > 1 && STREET_TYPE_PREFIXES.has(tokens[0])) tokens.shift();
  return tokens.map((token) => STREET_WORD_CANONICAL[token] ?? token).join(" ");
}

/**
 * BAIRRO — só canonicaliza abreviação de TIPO quando é a primeira palavra;
 * nunca remove ("JARDIM ALVORADA" continua diferente de "ALVORADA" — só o
 * tipo, nunca o nome, vira igual). Lista fechada e pequena por decisão do
 * usuário: antes de adicionar outra (ex.: "CJ" de conjunto habitacional),
 * auditar uso real.
 */
const NEIGHBORHOOD_TYPE_CANONICAL: Record<string, string> = {
  jd: "jardim",
  vl: "vila",
  res: "residencial",
  pq: "parque",
};

export function normalizeNeighborhood(value: string | null | undefined): string {
  const tokens = normalizeText(value).split(" ").filter(Boolean);
  if (tokens.length > 0 && NEIGHBORHOOD_TYPE_CANONICAL[tokens[0]]) {
    tokens[0] = NEIGHBORHOOD_TYPE_CANONICAL[tokens[0]];
  }
  return tokens.join(" ");
}

/**
 * COMPLEMENTO — texto livre, por isso cada abreviação de TIPO (não só a
 * primeira palavra: "APTO 225 BLOCO B" tem dois tipos na mesma string) vira
 * a forma completa; números e letras de bloco/apartamento nunca são
 * removidos ("AP 225" continua diferente de "AP 226"). Lista fechada por
 * decisão do usuário.
 */
const COMPLEMENT_TYPE_CANONICAL: Record<string, string> = {
  ap: "apartamento",
  apto: "apartamento",
  bl: "bloco",
  sl: "sala",
  cj: "conjunto",
  conj: "conjunto",
};

/**
 * "ENTRE AS RUAS 7 E 9" × "ENTRE RUA 7 E RUA 9" (e variações) — estrutura
 * ÚNICA e fechada, não fuzzy: só casa quando a string INTEIRA (^...$) é
 * exatamente "entre [as|a ]rua[s] X e [rua ]Y", com X e Y dígitos.
 * Canonicaliza pra "entre rua X e Y", preservando X/Y e a ordem — nunca
 * troca os dois lados, nunca inventa equivalência entre números diferentes.
 * "CASA ENTRE RUA 7 E 9" não casa (não começa com "entre") e fica como
 * está, token a token, sem nenhuma transformação estrutural.
 */
const ENTRE_RUAS_PATTERN = /^entre (?:as |a )?ruas? (\d+) e (?:ruas? )?(\d+)$/;

export function normalizeComplement(value: string | null | undefined): string {
  const base = normalizeText(value);
  const entreRuas = base.match(ENTRE_RUAS_PATTERN);
  const structural = entreRuas ? `entre rua ${entreRuas[1]} e ${entreRuas[2]}` : base;
  return structural
    .split(" ")
    .filter(Boolean)
    .map((token) => COMPLEMENT_TYPE_CANONICAL[token] ?? token)
    .join(" ");
}

/**
 * CIDADE — normalizeText sozinha já cobre tudo que a regra pede (caixa,
 * acento, pontuação/espaços) sem nenhuma aproximação entre cidades
 * diferentes ("SANTO ANTONIO" nunca vira igual a "SANTO ANTONIO DE
 * JESUS" — são tokens diferentes). Alias só por clareza de leitura no
 * call site, comportamento idêntico a antes.
 */
export const normalizeCity = normalizeText;

/**
 * NOME/DESTINATÁRIO — mesma base de normalizeText (caixa/acento/espaço),
 * nunca remove sobrenome nem aproxima nomes parecidos. Alias só por
 * clareza, comportamento idêntico a antes.
 */
export const normalizePersonName = normalizeText;

/**
 * UF — estrita por natureza (só 2 letras): normalizeText já cobre
 * caixa/espaço sem nenhuma aproximação ("SP" nunca vira igual a "MS").
 * Alias só por clareza, comportamento idêntico a antes.
 */
export const normalizeUf = normalizeText;

/**
 * NÚMERO — trim/caixa/pontuação via normalizeText. Auditoria em Production
 * (leitura) não achou nenhum endereço real com zero à esquerda nem com
 * "S/N"/"SN"/"S N" — por isso nenhuma das duas regras condicionais do
 * pedido foi adicionada; número realmente diferente continua divergência
 * ("145" ≠ "154").
 */
export function normalizeAddressNumber(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, "");
}

/**
 * CEP — só dígitos, comparação exata (já era assim; nenhuma mudança, só
 * documentado aqui junto dos outros por completude do mapa de regras).
 */
export function normalizeCep(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

export interface AddressInput {
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}

/**
 * Compara o endereço informado pela cliente com o da DANFE (ou etiqueta).
 * BLOCKED: rua, número, CEP, cidade ou UF diferentes.
 * REVIEW: complemento/bairro ausentes ou diferentes; campo não legível.
 */
export function compareAddress(expected: AddressInput, actual: AddressInput): FieldResult[] {
  const results: FieldResult[] = [];

  const street = (a: AddressInput) => normalizeStreet(a.street);
  if (!street(actual)) {
    results.push({ field: "rua", verdict: "REVIEW", reason: "Rua não encontrada no documento." });
  } else if (street(expected) !== street(actual)) {
    results.push({ field: "rua", verdict: "BLOCKED", reason: "Rua diferente." });
  } else {
    results.push({ field: "rua", verdict: "OK", reason: "" });
  }

  const number = (a: AddressInput) => normalizeAddressNumber(a.number);
  if (!number(actual)) {
    results.push({ field: "numero", verdict: "REVIEW", reason: "Número não encontrado no documento." });
  } else if (number(expected) !== number(actual)) {
    results.push({ field: "numero", verdict: "BLOCKED", reason: "Número diferente." });
  } else {
    results.push({ field: "numero", verdict: "OK", reason: "" });
  }

  const cep = (a: AddressInput) => normalizeCep(a.postalCode);
  if (!cep(actual)) {
    results.push({ field: "cep", verdict: "REVIEW", reason: "CEP não encontrado no documento." });
  } else if (cep(expected) !== cep(actual)) {
    results.push({ field: "cep", verdict: "BLOCKED", reason: "CEP diferente." });
  } else {
    results.push({ field: "cep", verdict: "OK", reason: "" });
  }

  const city = (a: AddressInput) => normalizeCity(a.city);
  if (!city(actual)) {
    results.push({ field: "cidade", verdict: "REVIEW", reason: "Cidade não encontrada no documento." });
  } else if (city(expected) !== city(actual)) {
    results.push({ field: "cidade", verdict: "BLOCKED", reason: "Cidade diferente." });
  } else {
    results.push({ field: "cidade", verdict: "OK", reason: "" });
  }

  const uf = (a: AddressInput) => normalizeUf(a.state);
  if (!uf(actual)) {
    results.push({ field: "uf", verdict: "REVIEW", reason: "UF não encontrada no documento." });
  } else if (uf(expected) !== uf(actual)) {
    results.push({ field: "uf", verdict: "BLOCKED", reason: "UF diferente." });
  } else {
    results.push({ field: "uf", verdict: "OK", reason: "" });
  }

  const soft = (field: string, normalize: (v: string | null) => string, a: string | null, b: string | null) => {
    const na = normalize(a);
    const nb = normalize(b);
    // Cliente e documento sem o campo (ex.: "Não possui complemento") = nada a comparar
    if (!na && !nb) return { field, verdict: "OK" as const, reason: "" };
    if (!nb) return { field, verdict: "REVIEW" as const, reason: `${field} ausente no documento.` };
    if (!na) return { field, verdict: "REVIEW" as const, reason: `${field} não informado pela cliente.` };
    if (na !== nb) return { field, verdict: "REVIEW" as const, reason: `${field} diferente: revisar.` };
    return { field, verdict: "OK" as const, reason: "" };
  };
  results.push(soft("complemento", normalizeComplement, expected.complement, actual.complement));
  results.push(soft("bairro", normalizeNeighborhood, expected.neighborhood, actual.neighborhood));

  return results;
}

/**
 * Valores em centavos, sem tolerância: qualquer diferença é BLOCKED —
 * EXCETO quando `legacyFreightOverride` vem `true` (só setado pelo chamador
 * quando o intake específico tem um override ativo e auditado, nunca por
 * padrão): aí a diferença vira informativa (`verdict: "OK"`, nunca entra em
 * blocking/review, nunca exige checkbox, nunca impede aprovação sozinha),
 * com `overrideCode` marcado pra UI mostrar "Frete legado" — a diferença
 * nunca é escondida, só deixa de bloquear.
 */
export function compareMoneyCents(
  expectedCents: number | null,
  actualCents: number | null,
  options?: { legacyFreightOverride?: boolean }
): FieldResult {
  if (expectedCents === null) return { field: "valor", verdict: "REVIEW", reason: "Valor esperado não informado." };
  if (actualCents === null) return { field: "valor", verdict: "REVIEW", reason: "Valor da NF-e não encontrado." };
  if (expectedCents !== actualCents) {
    if (options?.legacyFreightOverride) {
      return {
        field: "valor",
        verdict: "OK",
        reason: "Frete legado: diferença de valor aceita para esta venda anterior à nova regra de emissão.",
        overrideCode: "LEGACY_FREIGHT_NOT_INCLUDED_IN_NFE",
      };
    }
    return { field: "valor", verdict: "BLOCKED", reason: "Valor da NF-e diferente do valor da venda." };
  }
  return { field: "valor", verdict: "OK", reason: "" };
}

/** Reais (ex.: 139.99) → centavos inteiros, sem arredondamento silencioso. */
export function toCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return Math.abs(value * 100 - cents) < 1e-6 ? cents : null;
}
