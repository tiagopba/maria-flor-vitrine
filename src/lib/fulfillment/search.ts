import { normalizeForCompare, onlyDigits, stripLeadingZeros } from "./text.ts";

/**
 * Filtro `or=(...)` do PostgREST para a busca livre da listagem: nome, CPF
 * (com ou sem pontuação), número da NF-e e código de rastreio.
 *
 * Os três termos derivados (nome normalizado, só dígitos, só alfanumérico)
 * nunca contêm vírgula, parêntese, ponto nem asterisco — por isso podem ir
 * direto na string do filtro sem escape.
 */
export function buildSearchFilter(term: string): string | null {
  const trimmed = term.trim();
  if (!trimmed) return null;

  const name = normalizeForCompare(trimmed);
  const digits = onlyDigits(trimmed);
  const tracking = trimmed.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  const conditions: string[] = [];
  if (name) conditions.push(`customer_name_search.ilike.%${name}%`);
  if (digits.length >= 3) conditions.push(`customer_cpf.ilike.%${digits}%`);
  if (digits.length >= 1 && digits.length <= 9) conditions.push(`nfe_number.eq.${stripLeadingZeros(digits)}`);
  if (tracking.length >= 4) conditions.push(`tracking_code.ilike.%${tracking}%`);

  return conditions.length > 0 ? conditions.join(",") : null;
}
