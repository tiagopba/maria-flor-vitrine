"use client";

const STORAGE_KEY = "mf_session_id";

/**
 * UUID anônimo por navegador, sem dependência de IP ou dado pessoal.
 * Usado para agrupar analytics_events, favoritos locais e leads.
 */
export function getVisitorSessionId(): string {
  if (typeof window === "undefined") return "";

  let sessionId = window.localStorage.getItem(STORAGE_KEY);

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    window.localStorage.setItem(STORAGE_KEY, sessionId);
  }

  return sessionId;
}
