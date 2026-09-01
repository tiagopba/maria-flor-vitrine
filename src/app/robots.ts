import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";

/**
 * Bloqueia só o que realmente não deve ser indexado: Admin (qualquer rota
 * `/admin/*`, o prefixo já cobre `/admin/login` também), seleção
 * compartilhada (link privado mandado pra vendedora, não uma página de
 * conteúdo pública) e Favoritos (página pessoal, sem conteúdo próprio —
 * renderiza a partir do localStorage de cada cliente). Todo o resto do
 * catálogo público continua liberado.
 */
export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/selecao/", "/favoritos"],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
