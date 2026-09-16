"use client";

/**
 * Identificador OPACO exclusivo do Presence — nunca o mesmo valor do
 * analytics session_id (ver lib/session/visitor-id.ts, usado só em
 * analytics_events/leads). Um UUID aleatório sem nenhum significado,
 * persistido em localStorage: mesmo id em várias abas do mesmo
 * navegador (é exatamente isso que permite deduplicar por visitante no
 * Admin), mas sem nome, telefone, e-mail, IP ou qualquer dado pessoal.
 */
const STORAGE_KEY = "mariaflor:presence-id:v1";

export function getPresenceId(): string {
  if (typeof window === "undefined") return "";
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // localStorage indisponível (modo privado, quota) — gera um id só
    // pra esta aba; não persiste, mas o tracker continua funcionando.
    return crypto.randomUUID();
  }
}
