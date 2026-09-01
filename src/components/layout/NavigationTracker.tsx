"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Conta navegações client-side dentro do app nesta aba — usado pelo
 * BackButton pra saber se `router.back()` volta pra uma página nossa ou
 * sai do site. Testamos `window.history.state` (idx do App Router) antes,
 * mas o Next 16 não expõe mais esse campo; isso aqui não depende de
 * nenhum detalhe interno do framework, só do próprio pathname mudando.
 *
 * Também guarda a última página de LISTAGEM visitada (qualquer rota fora
 * de /produto/*, com seus query params) e quantos "pulos" de página
 * aconteceram dentro de /produto/* desde então — usado por "Ver mais
 * peças" (ProductWhatsAppFlow) pra voltar pra origem real da cliente, não
 * pra Home. Trocar de cor pelo slider da página de produto usa
 * `history.replaceState` (nunca muda o pathname via next/navigation), então
 * nunca conta como um "pulo" aqui — só cliques manuais em link (ex:
 * "Outras cores disponíveis", ou entrar num segundo produto) contam.
 *
 * Módulo-level (não sessionStorage) de propósito: precisa persistir
 * enquanto o layout público ficar montado (toda a navegação client-side
 * dentro do grupo (public)) e resetar sozinho num refresh completo — é
 * exatamente esse o comportamento de uma variável de módulo, que
 * reinicializa quando o bundle recarrega.
 */
let navigationCount = 0;
let lastListingPath: string | null = null;
let hopsFromListing = 0;

export function hasInternalHistory(): boolean {
  return navigationCount > 0;
}

/** Última página de listagem (fora de /produto/*) visitada nesta aba, com query params. */
export function getLastListingPath(): string | null {
  return lastListingPath;
}

/** Quantas trocas de página dentro de /produto/* aconteceram desde a última listagem (0 = ainda na mesma peça em que entrou vindo da listagem, ou só usou o slider). */
export function getHopsFromListing(): number {
  return hopsFromListing;
}

function currentPathWithQuery(pathname: string, searchParams: URLSearchParams): string {
  const qs = searchParams.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function NavigationTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isFirstRender = useRef(true);

  useEffect(() => {
    const isProductPage = pathname.startsWith("/produto/");

    if (isFirstRender.current) {
      isFirstRender.current = false;
      if (!isProductPage) lastListingPath = currentPathWithQuery(pathname, searchParams);
      return;
    }

    navigationCount++;
    if (isProductPage) {
      hopsFromListing++;
    } else {
      lastListingPath = currentPathWithQuery(pathname, searchParams);
      hopsFromListing = 0;
    }
  }, [pathname, searchParams]);

  return null;
}
