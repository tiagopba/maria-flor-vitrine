"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useFavoritesCount } from "@/lib/favorites/useFavorites";

/**
 * Coachmark discreto ensinando a função Favoritos — só para quem ainda não
 * favoritou nada. Aparece no máximo 1x por sessão de navegação (sessionStorage,
 * nunca localStorage: numa aba/sessão nova com 0 favoritos, pode aparecer de
 * novo). `fixed` de propósito — nunca desloca layout nem participa do fluxo
 * normal da página.
 */
const SESSION_KEY = "mariaflor:favorites-tip-shown-session:v1";
const SHOW_DELAY_MS = 4000;
const AUTO_HIDE_MS = 7000;

// Páginas onde a dica não faz sentido: /favoritos já explica isso no próprio
// estado vazio, e /selecao/[token] é a tela que a VENDEDORA vê, não a cliente.
const HIDDEN_PATH_PREFIXES = ["/favoritos", "/selecao"];

export function FavoritesDiscoveryTip() {
  const pathname = usePathname();
  const count = useFavoritesCount();
  const [visible, setVisible] = useState(false);

  const pathnameRef = useRef(pathname);
  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (count > 0) return;

    let alreadyShown = false;
    try {
      alreadyShown = window.sessionStorage.getItem(SESSION_KEY) === "1";
    } catch {
      // sessionStorage indisponível (modo privado/navegador restrito) —
      // trata como "ainda não mostrada" em vez de quebrar a dica.
    }
    if (alreadyShown) return;

    const showTimer = setTimeout(() => {
      if (HIDDEN_PATH_PREFIXES.some((prefix) => pathnameRef.current.startsWith(prefix))) return;

      setVisible(true);
      try {
        window.sessionStorage.setItem(SESSION_KEY, "1");
      } catch {
        // sem sessionStorage, a dica pode reaparecer numa navegação seguinte
        // dentro da mesma sessão — degradação aceitável, nunca quebra nada.
      }
    }, SHOW_DELAY_MS);

    return () => clearTimeout(showTimer);
    // Só na primeira montagem do layout público (uma vez por carregamento) —
    // o guard de `count` no render abaixo cobre qualquer mudança depois disso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!visible) return;
    const hideTimer = setTimeout(() => setVisible(false), AUTO_HIDE_MS);
    return () => clearTimeout(hideTimer);
  }, [visible]);

  if (count > 0 || !visible) return null;

  return (
    <div
      role="status"
      className="fixed top-16 right-4 z-30 w-[min(280px,calc(100vw-2rem))] rounded-xl border border-border bg-surface p-3 pr-7 text-text shadow-lg"
    >
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label="Fechar dica"
        className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-full text-text-muted hover:bg-muted"
      >
        <span aria-hidden="true" className="text-base leading-none">
          ×
        </span>
      </button>
      <p className="text-sm font-medium">Gostou de uma peça? ❤️</p>
      <p className="mt-1 text-xs text-text-muted">
        Toque no coração para salvar e enviar tudo depois para sua vendedora.
      </p>
    </div>
  );
}
