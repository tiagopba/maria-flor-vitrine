import "server-only";

import { createHash } from "node:crypto";

/**
 * Normalização + hash exigidos pela Meta para `user_data` da Conversions
 * API — nunca mandamos valor cru pra Meta, só o SHA-256. Regra única pros
 * três campos usados aqui: minúsculas + trim, depois SHA-256 em hex (ver
 * https://developers.facebook.com/docs/marketing-api/conversions-api/parameters/customer-information-parameters).
 * `server-only` porque isto roda sempre a um passo de enviar à Meta — nunca
 * deveria ser chamado nem reimplementado no client.
 */
function normalizeAndHash(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("hex");
}

/** `em` — só deve ser chamado com um e-mail coletado de verdade (nunca inventado). */
export function hashEmail(email: string): string {
  return normalizeAndHash(email);
}

/**
 * `external_id` — não é PII (é só um identificador interno, ex.: o
 * session_id anônimo já usado em analytics_events), mas a Meta recomenda
 * hashear mesmo assim. Nunca é, por si só, garantia de resolver o
 * diagnóstico de "parâmetros ausentes" — só mais um sinal de correspondência
 * quando não há e-mail/telefone/nome disponíveis.
 */
export function hashExternalId(id: string): string {
  return normalizeAndHash(id);
}

/**
 * `fn`/`ln` — divide pelo primeiro espaço (primeiro nome / resto como
 * sobrenome). Aproximação aceita pela própria Meta para nomes completos;
 * nunca usado como critério isolado de correspondência.
 */
export function hashFullNameParts(fullName: string): { fn?: string; ln?: string } {
  const trimmed = fullName.trim();
  if (!trimmed) return {};

  const [first, ...rest] = trimmed.split(/\s+/);
  const last = rest.join(" ");

  return {
    fn: first ? normalizeAndHash(first) : undefined,
    ln: last ? normalizeAndHash(last) : undefined,
  };
}
