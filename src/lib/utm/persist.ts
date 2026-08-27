"use client";

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

/**
 * Lê UTMs da URL atual e persiste em sessionStorage (dura a sessão do
 * navegador). Se a URL não trouxer UTMs, mantém o que já estava salvo —
 * assim a origem da visita sobrevive até o clique no WhatsApp.
 */
export function captureAndPersistUtm(): UtmData {
  if (typeof window === "undefined") return {};

  const params = new URLSearchParams(window.location.search);
  const hasNewUtm = UTM_PARAMS.some((key) => params.has(key));

  if (hasNewUtm) {
    const data: UtmData = { referrer: document.referrer || undefined };
    UTM_PARAMS.forEach((key) => {
      const value = params.get(key);
      if (value) data[key] = value;
    });
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return data;
  }

  return getPersistedUtm();
}

export function getPersistedUtm(): UtmData {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as UtmData) : {};
  } catch {
    return {};
  }
}
