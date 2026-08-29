"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Conta navegações client-side dentro do app nesta aba — usado pelo
 * BackButton pra saber se `router.back()` volta pra uma página nossa ou
 * sai do site. Testamos `window.history.state` (idx do App Router) antes,
 * mas o Next 16 não expõe mais esse campo; isso aqui não depende de
 * nenhum detalhe interno do framework, só do próprio pathname mudando.
 *
 * Módulo-level (não sessionStorage) de propósito: precisa persistir
 * enquanto o layout público ficar montado (toda a navegação client-side
 * dentro do grupo (public)) e resetar sozinho num refresh completo — é
 * exatamente esse o comportamento de uma variável de módulo, que
 * reinicializa quando o bundle recarrega.
 */
let navigationCount = 0;

export function hasInternalHistory(): boolean {
  return navigationCount > 0;
}

export function NavigationTracker() {
  const pathname = usePathname();
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    navigationCount++;
  }, [pathname]);

  return null;
}
