import { STORE_UTC_OFFSET } from "./schema.ts";
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

/**
 * Filtro por dia (aaaa-mm-dd): casa a data de emissão da NF-e, a data da
 * etiqueta ou o dia em que o registro foi criado — sempre no fuso da loja.
 */
export function buildDateFilter(isoDate: string): string | null {
  const m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;

  const start = new Date(`${isoDate}T00:00:00${STORE_UTC_OFFSET}`);
  if (Number.isNaN(start.getTime())) return null;
  // Rejeita datas "roladas" (ex: 2026-02-31).
  const check = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (check.getUTCMonth() !== Number(m[2]) - 1) return null;

  const from = start.toISOString();
  const to = new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString();
  return [
    `nfe_issued_at.eq.${isoDate}`,
    `and(shipping_label_date.gte.${from},shipping_label_date.lt.${to})`,
    `and(created_at.gte.${from},created_at.lt.${to})`,
  ].join(",");
}
