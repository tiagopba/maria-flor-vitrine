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
  }
}
