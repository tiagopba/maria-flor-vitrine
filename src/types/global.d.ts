export {};

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
    /**
     * Ponte pro base code inline do Pixel (ver MetaPixel.tsx) sinalizar,
     * como última linha do PRÓPRIO script que cria `window.fbq`, que o
     * Pixel está pronto — ver markMetaPixelReady em lib/analytics/meta-pixel.ts.
     */
    __flushMetaPixelQueue?: () => void;
    /**
     * Ponte pro `onload` do `<script src=".../fbevents.js">` real (inserido
     * pelo mesmo base code, ver MetaPixel.tsx) sinalizar que o Pixel de
     * verdade terminou de carregar — só a partir daí `_fbp`/`_fbc` existem
     * no navegador. Diferente de `__flushMetaPixelQueue` acima (que só
     * garante o SHIM `window.fbq`) — ver waitForFacebookBrowserIds em
     * lib/analytics/meta-pixel.ts.
     */
    __onMetaFbeventsLoaded?: () => void;
  }
}
