"use client";

import { getVisitorSessionId } from "@/lib/session/visitor-id";

const STORAGE_KEY = "mf_utm";
const UTM_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

export interface UtmData {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  referrer?: string;
}

interface StoredUtmData extends UtmData {
  /** Sessão a que este dado pertence — ver lib/session/visitor-id.ts. Não
   * é exposto pelas funções públicas abaixo, só usado pra saber se o dado
   * guardado ainda vale pra sessão atual ou já é de uma sessão anterior
   * (encerrada por inatividade). */
  sessionId: string;
}

/**
 * Lê UTMs da URL atual e persiste em localStorage, atrelado à sessão
 * atual (lib/session/visitor-id.ts — expira depois de ~30min de
 * inatividade). Quando a sessão expira e um novo session_id é gerado, o
 * dado antigo passa a não bater mais (`sessionId` divergente) e uma nova
 * captura acontece na próxima chamada, mesmo sem UTM na URL.
 *
 * Prioridade: UTM na URL agora sempre vence — se a URL atual tem algum
 * utm_*, sempre recaptura e sobrescreve (mesmo dentro da mesma sessão;
 * ex.: clicou em outro anúncio). Sem UTM na URL:
 * - se a sessão atual já tem algo capturado, mantém o que já estava salvo;
 * - se é a primeira chamada desta sessão (nada salvo ainda), grava só o
 *   `document.referrer`, quando existir — cobre origem orgânica sem
 *   nenhuma marcação (Instagram, Google etc. sem utm_*), que antes ficava
 *   sem registro nenhum.
 * Nunca inventa um referrer/utm que não existe: sem URL com utm e sem
 * `document.referrer`, o resultado fica vazio mesmo.
 */
export function captureAndPersistUtm(): UtmData {
  if (typeof window === "undefined") return {};

  const sessionId = getVisitorSessionId();
  const params = new URLSearchParams(window.location.search);
  const hasNewUtm = UTM_PARAMS.some((key) => params.has(key));
  const stored = readStored();

  if (hasNewUtm) {
    const data: StoredUtmData = { sessionId, referrer: document.referrer || undefined };
    UTM_PARAMS.forEach((key) => {
      const value = params.get(key);
      if (value) data[key] = value;
    });
    persist(data);
    return stripSessionId(data);
  }

  if (stored && stored.sessionId === sessionId) {
    return stripSessionId(stored);
  }

  // Primeira chamada desta sessão, sem UTM na URL — ainda assim registra
  // o referrer real da entrada, se existir.
  const data: StoredUtmData = { sessionId, referrer: document.referrer || undefined };
  persist(data);
  return stripSessionId(data);
}

export function getPersistedUtm(): UtmData {
  if (typeof window === "undefined") return {};

  const sessionId = getVisitorSessionId();
  const stored = readStored();
  if (!stored || stored.sessionId !== sessionId) return {};

  return stripSessionId(stored);
}

function readStored(): StoredUtmData | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredUtmData) : null;
  } catch {
    return null;
  }
}

function persist(data: StoredUtmData): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Sem crash se localStorage estiver indisponível/cheio — a sessão
    // continua funcionando, só sem atribuição persistida.
  }
}

function stripSessionId(data: StoredUtmData): UtmData {
  return {
    utm_source: data.utm_source,
    utm_medium: data.utm_medium,
    utm_campaign: data.utm_campaign,
    utm_content: data.utm_content,
    utm_term: data.utm_term,
    referrer: data.referrer,
  };
}
