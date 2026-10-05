// Helpers puros (sem server-only, sem React) do módulo Faturamento e Envios.
// Imports com extensão ".ts" de propósito: estes módulos também rodam direto
// no Node (node --test) sem bundler.

const DIACRITICS = /[̀-ͯ]/g;

/** Caixa baixa, sem acento, sem pontuação, espaços colapsados — para comparar/buscar texto. */
export function normalizeForCompare(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function onlyDigits(value: string | null | undefined): string {
  return value ? value.replace(/\D/g, "") : "";
}

/** "000006" → "6". Mantém "0" se tudo for zero. */
export function stripLeadingZeros(digits: string): string {
  const stripped = digits.replace(/^0+/, "");
  return stripped === "" && digits !== "" ? "0" : stripped;
}

/** 11 dígitos → 000.000.000-00 · 14 dígitos → 00.000.000/0000-00 · senão devolve como veio. */
export function formatCpfCnpj(digits: string | null | undefined): string {
  const d = onlyDigits(digits);
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  return digits ?? "";
}

// Esconde tudo menos os 2 últimos dígitos: ***.***.***-02 (CPF) ou o equivalente para CNPJ.
export function maskCpfCnpj(digits: string | null | undefined): string {
  const d = onlyDigits(digits);
  if (d.length === 11) return `***.***.***-${d.slice(9)}`;
  if (d.length === 14) return `**.***.***/****-${d.slice(12)}`;
  return d ? "***" : "—";
}

export function formatPostalCode(digits: string | null | undefined): string {
  const d = onlyDigits(digits);
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : (digits ?? "");
}

/** "1.139,99" → 1139.99 · null se não for um valor monetário válido. */
export function parseBrazilianMoney(value: string): number | null {
  const cleaned = value.trim().replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/** dd/mm/aaaa → aaaa-mm-dd (null se não for uma data real). */
export function brDateToIso(day: string, month: string, year: string): string | null {
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

export function splitLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
