// Comparação de endereço para o CONFERE GERAL — PURO.
// Regra: só abreviações de uma LISTA FECHADA são equivalentes. Nada de fuzzy matching:
// ruas realmente diferentes nunca viram iguais.

export type FieldVerdict = "OK" | "REVIEW" | "BLOCKED";

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

export function normalizeStreet(value: string | null | undefined): string {
  return normalizeText(value)
    .split(" ")
    .filter(Boolean)
    .map((token) => STREET_ABBREVIATIONS[token] ?? token)
    .join(" ");
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

  const soft = (field: string, a: string | null, b: string | null) => {
    const na = normalizeText(a);
    const nb = normalizeText(b);
    if (!nb) return { field, verdict: "REVIEW" as const, reason: `${field} ausente no documento.` };
    if (!na) return { field, verdict: "REVIEW" as const, reason: `${field} não informado pela cliente.` };
    if (na !== nb) return { field, verdict: "REVIEW" as const, reason: `${field} diferente: revisar.` };
    return { field, verdict: "OK" as const, reason: "" };
  };
  results.push(soft("complemento", expected.complement, actual.complement));
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
