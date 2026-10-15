// Comparação de endereço para o CONFERE GERAL — PURO.
// Regra: só abreviações de uma LISTA FECHADA são equivalentes. Nada de fuzzy matching:
// ruas realmente diferentes nunca viram iguais.

/** NOT_COMPARABLE: o documento não traz o dado de forma confiável; não é erro nem aviso. */
export type FieldVerdict = "OK" | "REVIEW" | "BLOCKED" | "NOT_COMPARABLE";

export interface FieldResult {
  field: string;
  verdict: FieldVerdict;
  reason: string;
}

/** Abreviações comuns → forma completa. Lista fechada, por decisão do usuário. */
const STREET_ABBREVIATIONS: Record<string, string> = {
  r: "rua",
  av: "avenida",
  rod: "rodovia",
  trav: "travessa",
  al: "alameda",
  est: "estrada",
  pc: "praca",
  praca: "praca",
  pca: "praca",
};

const DIACRITICS = /[̀-ͯ]/g;

/** Caixa, acentos, pontuação e espaços saem; abreviações da lista viram a forma completa. */
export function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Palavras de logradouro (já expandidas) que não identificam a rua em si — ver normalizeStreet. */
const STREET_PREFIXES = new Set(["rua", "avenida", "rodovia", "travessa", "alameda", "estrada", "praca"]);

/**
 * "Rua Itapaci" e "Itapaci" são a MESMA rua: a cliente no formulário público
 * só digita o nome, mas o XML da NF-e sempre vem com o logradouro completo
 * (xLgr). Bug real: sem este passo, a comparação via BLOCKED ("Rua diferente")
 * mesmo com a rua certa, só porque um lado tinha o prefixo e o outro não.
 * Remove um prefixo de logradouro (já expandido pela lista de abreviações)
 * só quando é o PRIMEIRO token e sobra pelo menos mais um — nunca esvazia uma
 * rua cujo nome de verdade é só "Rua" ou similar (caso extremo, mas possível).
 */
export function normalizeStreet(value: string | null | undefined): string {
  const tokens = normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => STREET_ABBREVIATIONS[token] ?? token);
  if (tokens.length > 1 && STREET_PREFIXES.has(tokens[0])) {
    tokens.shift();
  }
  return tokens.join(" ");
}

/**
 * Normalização conservadora do COMPLEMENTO — só estrutura segura, nunca fuzzy
 * matching amplo. Três transformações, nessa ordem:
 *   1. remove artigo (a/as/o/os) logo antes de "rua"/"ruas";
 *   2. "ruas" (plural) vira "rua" (singular);
 *   3. em "rua X e Y" (X e Y só dígitos), repete o logradouro antes do
 *      segundo número: "rua 7 e 9" vira "rua 7 e rua 9".
 * Caso real: "ENTRE AS RUAS 7 E 9" e "ENTRE RUA 7 E RUA 9" descrevem o MESMO
 * lugar, só com estrutura de frase diferente — viram a mesma forma aqui.
 * Números e palavras realmente diferentes (outro logradouro, outro número)
 * NUNCA ficam iguais: o passo 3 só mexe quando os dois lados do "e" já são
 * dígitos puros, então "rua 7 e avenida 9" ou "rua 7 e 10" não são tocados
 * (ou, no segundo caso, continuam diferentes de "rua 7 e rua 9").
 */
export function normalizeComplement(value: string | null | undefined): string {
  let text = normalizeText(value);
  if (!text) return text;
  text = text.replace(/\b(a|as|o|os)\s+(ruas?)\b/g, "$2");
  text = text.replace(/\bruas\b/g, "rua");
  text = text.replace(/\brua (\d+) e (?!rua\b)(\d+)\b/g, "rua $1 e rua $2");
  return text;
}

export function normalizeNumber(value: string | null | undefined): string {
  return normalizeText(value).replace(/\s+/g, "");
}

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

  const number = (a: AddressInput) => normalizeNumber(a.number);
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

  const city = (a: AddressInput) => normalizeText(a.city);
  if (!city(actual)) {
    results.push({ field: "cidade", verdict: "REVIEW", reason: "Cidade não encontrada no documento." });
  } else if (city(expected) !== city(actual)) {
    results.push({ field: "cidade", verdict: "BLOCKED", reason: "Cidade diferente." });
  } else {
    results.push({ field: "cidade", verdict: "OK", reason: "" });
  }

  const uf = (a: AddressInput) => normalizeText(a.state);
  if (!uf(actual)) {
    results.push({ field: "uf", verdict: "REVIEW", reason: "UF não encontrada no documento." });
  } else if (uf(expected) !== uf(actual)) {
    results.push({ field: "uf", verdict: "BLOCKED", reason: "UF diferente." });
  } else {
    results.push({ field: "uf", verdict: "OK", reason: "" });
  }

  const soft = (field: string, a: string | null, b: string | null, normalize: (v: string | null) => string = normalizeText) => {
    const na = normalize(a);
    const nb = normalize(b);
    // Cliente e documento sem o campo (ex.: "Não possui complemento") = nada a comparar
    if (!na && !nb) return { field, verdict: "OK" as const, reason: "" };
    if (!nb) return { field, verdict: "REVIEW" as const, reason: `${field} ausente no documento.` };
    if (!na) return { field, verdict: "REVIEW" as const, reason: `${field} não informado pela cliente.` };
    if (na !== nb) return { field, verdict: "REVIEW" as const, reason: `${field} diferente: revisar.` };
    return { field, verdict: "OK" as const, reason: "" };
  };
  results.push(soft("complemento", expected.complement, actual.complement, normalizeComplement));
  results.push(soft("bairro", expected.neighborhood, actual.neighborhood));

  return results;
}

/** Valores em centavos, sem tolerância: qualquer diferença é BLOCKED. */
export function compareMoneyCents(expectedCents: number | null, actualCents: number | null): FieldResult {
  if (expectedCents === null) return { field: "valor", verdict: "REVIEW", reason: "Valor esperado não informado." };
  if (actualCents === null) return { field: "valor", verdict: "REVIEW", reason: "Valor da NF-e não encontrado." };
  if (expectedCents !== actualCents) return { field: "valor", verdict: "BLOCKED", reason: "Valor da NF-e diferente do valor da venda." };
  return { field: "valor", verdict: "OK", reason: "" };
}

/** Reais (ex.: 139.99) → centavos inteiros, sem arredondamento silencioso. */
export function toCents(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const cents = Math.round(value * 100);
  return Math.abs(value * 100 - cents) < 1e-6 ? cents : null;
}
