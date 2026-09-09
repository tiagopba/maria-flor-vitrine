"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { getMetaPixelId, markMetaPixelReady, trackPageView } from "@/lib/analytics/meta-pixel";

/**
 * Base code oficial do Meta Pixel — carregado só quando
 * `NEXT_PUBLIC_META_PIXEL_ID` está configurado (nunca hardcoded, ver
 * lib/analytics/meta-pixel.ts). `PageView` dispara uma vez no load inicial
 * (dentro do próprio base code) e de novo a cada troca de rota client-side
 * (o Pixel não sabe de navegação do App Router sozinho, mesmo padrão usado
 * pra qualquer SPA).
 */
export function MetaPixel() {
  const pixelId = getMetaPixelId();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;
  // Guarda pelo VALOR da rota já contabilizada (não um booleano de "já
  // passou da primeira renderização") — um booleano quebra em desenvolvimento
  // porque o React Strict Mode roda o efeito de montagem duas vezes de
  // propósito (diagnóstico, só em dev), e um simples toggle interpretaria a
  // segunda chamada como "troca de rota" e disparia um PageView duplicado.
  // Comparar contra a própria rota é idempotente: reexecutar o efeito para a
  // MESMA rota nunca dispara de novo, só uma troca real de valor dispara.
  const lastTrackedRoute = useRef<string | null>(null);

  useEffect(() => {
    if (!pixelId) return;
    if (lastTrackedRoute.current === routeKey) return;
    if (lastTrackedRoute.current === null) {
      // O próprio base code (script abaixo) já dispara o PageView inicial.
      lastTrackedRoute.current = routeKey;
      return;
    }
    lastTrackedRoute.current = routeKey;
    trackPageView();
  }, [pixelId, routeKey]);

  if (!pixelId) return null;

  return (
    <Script
      id="meta-pixel-base"
      strategy="afterInteractive"
      // Sinaliza pra fila em lib/analytics/meta-pixel.ts que window.fbq já
      // existe de verdade — corrige a corrida em que componentes que
      // disparam evento no mount (ex.: ProductViewTracker) podiam rodar
      // antes desta tag <Script> ser injetada/executada, perdendo o
      // ViewContent do Browser em silêncio. onReady roda depois do próprio
      // conteúdo deste script (inclusive scripts inline, com id — ver
      // next/script), então window.fbq já é garantido existir aqui.
      onReady={() => markMetaPixelReady()}
    >
      {`
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
        n.callMethod.apply(n,arguments):n.queue.push(arguments)};
        if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
        n.queue=[];t=b.createElement(e);t.async=!0;
        t.src=v;s=b.getElementsByTagName(e)[0];
        s.parentNode.insertBefore(t,s)}(window, document,'script',
        'https://connect.facebook.net/en_US/fbevents.js');
        fbq('init', '${pixelId}');
        fbq('track', 'PageView');
      `}
    </Script>
  );
}
