"use client";

/**
 * Flag temporária (sessionStorage, não localStorage — "estado local
 * temporário" da spec, não precisa sobreviver além da sessão do navegador)
 * indicando que a cliente acabou de tocar em "Falar com uma vendedora" e
 * seguiu para o WhatsApp com a seleção atual. Não tentamos detectar
 * "fechou o navegador"; só marcamos aqui antes de `window.location.href =
 * url` e checamos essa flag quando o site volta a ficar visível
 * (PostContactPrompt), pra perguntar se ela quer manter ou começar uma
 * seleção nova — uma única vez, até ela responder.
 */
const FLAG_KEY = "mariaflor:favorites:justContactedSeller:v1";

export function markJustContactedSeller(): void {
  try {
    window.sessionStorage.setItem(FLAG_KEY, "1");
  } catch {
    // sessionStorage indisponível (modo privado/navegador restrito) — sem
    // a flag a pergunta simplesmente não aparece depois, degradação aceitável.
  }
}

export function hasJustContactedSeller(): boolean {
  try {
    return window.sessionStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearJustContactedSeller(): void {
  try {
    window.sessionStorage.removeItem(FLAG_KEY);
  } catch {
    // nada a limpar se sessionStorage não está disponível.
  }
}
