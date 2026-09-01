"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { getMetaPixelId } from "@/lib/analytics/meta-pixel";

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
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (!pixelId) return;
    if (isFirstRender.current) {
      // O próprio base code (script abaixo) já dispara o PageView inicial.
      isFirstRender.current = false;
      return;
    }
    window.fbq?.("track", "PageView");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  if (!pixelId) return null;

  return (
    <Script id="meta-pixel-base" strategy="afterInteractive">
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
