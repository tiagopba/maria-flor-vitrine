import type { PageType } from "./constants";

/**
 * Normaliza o pathname em categoria — nunca a URL completa nem
 * querystring entram no Presence (ver PresenceMeta). Ordem importa:
 * prefixos mais específicos primeiro.
 */
export function normalizePageType(pathname: string): PageType {
  if (pathname === "/") return "HOME";
  if (pathname.startsWith("/novidades")) return "NOVIDADES";
  if (pathname.startsWith("/categoria/")) return "CATEGORIA";
  if (pathname.startsWith("/produto/")) return "PRODUTO";
  if (pathname.startsWith("/favoritos")) return "FAVORITOS";
  if (pathname.startsWith("/selecao/")) return "SELECAO";
  return "OUTROS";
}
