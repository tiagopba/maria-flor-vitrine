"use client";

const STORAGE_KEY = "mf_session_id";
const LAST_ACTIVITY_KEY = "mf_session_last_activity";

/** ~30min de inatividade — mesma janela clássica de "sessão" em analytics
 * web, aplicada aqui como timeout deslizante (cada chamada renova). */
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Id anônimo por navegador, sem dependência de IP ou dado pessoal. Usado
 * SÓ como campo de atribuição em analytics_events/leads — nunca como
 * chave de favoritos (isso é por product_id, ver lib/favorites/storage.ts)
 * nem de nenhuma outra identidade interna.
 *
 * Sessão real com timeout de inatividade: o mesmo session_id continua
 * valendo enquanto a cliente navega (cada chamada só atualiza o
 * timestamp de última atividade, sem trocar o id) — mas se passar mais de
 * SESSION_TIMEOUT_MS desde a última chamada, a sessão é considerada
 * encerrada e um novo session_id é gerado na próxima. Continua em
 * localStorage (não sessionStorage) — sobrevive fechar/abrir aba, só não
 * sobrevive ~30min sem nenhuma atividade.
 *
 * Dados gravados ANTES desta mudança foram produzidos sob a semântica
 * antiga (session_id persistente sem expiração — um "session_id" podia
 * cobrir dias/semanas de visitas). Essa mudança só vale a partir de
 * quando o código entra no ar; nenhum dado histórico é reescrito.
 */
export function getVisitorSessionId(): string {
  if (typeof window === "undefined") return "";

  const now = Date.now();
  const storedSessionId = window.localStorage.getItem(STORAGE_KEY);
  const lastActivityRaw = window.localStorage.getItem(LAST_ACTIVITY_KEY);
  const lastActivity = lastActivityRaw ? Number(lastActivityRaw) : null;

  const expired = !storedSessionId || lastActivity == null || now - lastActivity > SESSION_TIMEOUT_MS;
  const sessionId = expired || !storedSessionId ? crypto.randomUUID() : storedSessionId;

  window.localStorage.setItem(STORAGE_KEY, sessionId);
  window.localStorage.setItem(LAST_ACTIVITY_KEY, String(now));

  return sessionId;
}
