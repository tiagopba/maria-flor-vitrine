import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/site";
import { getVisibleCategoriesPublic } from "@/lib/db/categories";
import { listPublishedProducts } from "@/lib/db/products";

// Mesmo motivo do `force-dynamic` da Home/páginas institucionais: sem isso
// o sitemap ficaria congelado no HTML do último deploy, sem refletir
// produtos/categorias cadastrados depois.
export const dynamic = "force-dynamic";

/**
 * Só URLs públicas úteis pra indexação — nunca `/admin`, `/selecao/[token]`
 * (link privado), `/favoritos` (página pessoal sem conteúdo próprio) ou
 * `/busca` (resultado de busca interna, já marcado `noindex` na própria
 * página — ver generateMetadata de app/(public)/busca/page.tsx).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();

  const [categories, products] = await Promise.all([
    getVisibleCategoriesPublic(),
    // Sem paginação própria pra sitemap ainda — reaproveita a listagem
    // pública existente com um limite alto o suficiente pro catálogo real
    // da loja em vez de criar uma nova consulta só pra isso.
    listPublishedProducts(10000),
  ]);

  const staticPages: MetadataRoute.Sitemap = [
    { url: `${siteUrl}/`, changeFrequency: "daily", priority: 1 },
    { url: `${siteUrl}/novidades`, changeFrequency: "daily", priority: 0.9 },
    { url: `${siteUrl}/ofertas`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${siteUrl}/quem-somos`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/como-chegar`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${siteUrl}/politica-de-privacidade`, changeFrequency: "yearly", priority: 0.2 },
  ];

  const categoryPages: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${siteUrl}/categoria/${category.slug}`,
    changeFrequency: "daily",
    priority: 0.8,
  }));

  const productPages: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${siteUrl}/produto/${product.slug}`,
    lastModified: product.updated_at,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticPages, ...categoryPages, ...productPages];
}
