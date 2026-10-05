// WhatsApp do cliente — PURO. Normaliza para "55" + DDD + celular (só dígitos).
// Nunca inventa número: entrada ambígua ou incompleta é recusada.

/** Forma guardada no banco: 55 + DDD (2) + celular (9, começando em 9). Ex.: 5567999999999. */
export const CUSTOMER_WHATSAPP_PATTERN = /^55[1-9][0-9]9[0-9]{8}$/;

export type WhatsappNormalization = { ok: true; value: string } | { ok: false; error: string };

const INVALID = "Informe o celular com DDD, por exemplo (67) 99999-9999.";

/**
 * Aceita "(67) 99999-9999", "67999999999", "+55 67 99999-9999", "5567999999999".
 *  - 13 dígitos começando em 55  → já tem o código do país.
 *  - 11 dígitos                  → DDD + celular; acrescenta 55.
 *  - qualquer outra coisa        → inválido (inclusive letras e fixos de 10 dígitos).
 */
export function normalizeCustomerWhatsapp(raw: string | null | undefined): WhatsappNormalization {
  const trimmed = (raw ?? "").trim();
  if (trimmed === "") return { ok: false, error: INVALID };
  if (/[^\d\s()+\-.]/.test(trimmed)) return { ok: false, error: INVALID };

  const digits = trimmed.replace(/\D/g, "");
  const candidate = digits.length === 13 && digits.startsWith("55") ? digits : digits.length === 11 ? `55${digits}` : null;
  if (!candidate || !CUSTOMER_WHATSAPP_PATTERN.test(candidate)) return { ok: false, error: INVALID };
  return { ok: true, value: candidate };
}

/** "5567999999999" → "(67) 99999-9999" para exibir. Valor inválido → null. */
export function formatCustomerWhatsapp(value: string | null | undefined): string | null {
  if (!value || !CUSTOMER_WHATSAPP_PATTERN.test(value)) return null;
  const local = value.slice(2);
  return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
}
