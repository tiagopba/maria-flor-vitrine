// CEP da coleta — PURO. Exibição: 00000-000. Banco: somente 8 dígitos (79500000).

export const CEP_DIGITS = 8;

/** Só dígitos, no máximo 8. Qualquer outro caractere é descartado. */
export function normalizeCep(input: string | null | undefined): string {
  return (input ?? "").replace(/\D/g, "").slice(0, CEP_DIGITS);
}

/** Máscara durante a digitação: "79500000" → "79500-000"; prefixos parciais também. */
export function formatCep(input: string | null | undefined): string {
  const digits = normalizeCep(input);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

/** Válido só com exatamente 8 dígitos (aceita a máscara ou os dígitos puros). */
export function isValidCep(input: string | null | undefined): boolean {
  const raw = (input ?? "").trim();
  if (!/^\d{5}-?\d{3}$/.test(raw)) return false;
  return normalizeCep(raw).length === CEP_DIGITS;
}
