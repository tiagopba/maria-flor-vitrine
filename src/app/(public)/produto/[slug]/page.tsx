import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { BackButton } from "@/components/layout/BackButton";
import { CategoryCarousel } from "@/components/catalog/CategoryCarousel";
import { ProductDetailView } from "@/components/catalog/ProductDetailView";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { buildExploreCategoriesItems } from "@/lib/catalog/explore-categories";
import { getVisibleCategoriesPublic } from "@/lib/db/categories";
import {
  getProductBySlugPublic,
  getPublishedGroupMembersFull,
  getRelatedProductsPublic,
} from "@/lib/db/products";
import { resolveProductSlugRedirect } from "@/lib/db/product-slug";
import { getActiveSellersForModal } from "@/lib/db/sellers";
import { getPaymentSettings } from "@/lib/site-settings/payments";
import { buildProductDescription, titleCase } from "@/lib/seo/local";
import { buildProductJsonLd } from "@/lib/seo/structured-data";
import { JsonLd } from "@/components/seo/JsonLd";
import { getSiteUrl } from "@/lib/site";
import { ProductViewTracker } from "@/components/analytics/ProductViewTracker";
import { resolveProductPricing } from "@/lib/catalog/pricing";

export async function generateMetadata({
  params,
}: PageProps<"/produto/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlugPublic(slug);

  if (!product) return {};

  // `absolute` — "Maria Flor Paranaíba MS" já é o sufixo completo desejado
  // aqui; o template padrão do layout raiz só acrescentaria "| Maria Flor"
  // de novo em cima disso.
  const title = `${titleCase(product.name)} | Maria Flor Paranaíba MS`;
  const description = product.description ?? buildProductDescription(product.name, product.code);
  const image = product.images[0]?.url;

  return {
    title: { absolute: title },
    description,
    alternates: { canonical: `/produto/${product.slug}` },
    openGraph: {
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function ProductPage({ params }: PageProps<"/produto/[slug]">) {
  const { slug } = await params;
  const product = await getProductBySlugPublic(slug);

  if (!product) {
    // Endereço antigo de um produto que já foi publicado e mudou de
    // slug — redireciona permanentemente pro endereço atual (sempre
    // resolvido ao vivo, nunca fica preso a uma cadeia antiga; ver
    // lib/db/product-slug.ts). Só então cai no 404 de verdade.
    const redirectTarget = await resolveProductSlugRedirect(slug);
    if (redirectTarget) permanentRedirect(`/produto/${redirectTarget.slug}`);
    notFound();
  }

  const [sellers, related, categories, paymentSettings, groupMembers] = await Promise.all([
    getActiveSellersForModal(),
    getRelatedProductsPublic(product.id, product.category_id, product.product_group_id),
    getVisibleCategoriesPublic(),
    getPaymentSettings(),
    product.product_group_id ? getPublishedGroupMembersFull(product.product_group_id) : Promise.resolve([product]),
  ]);

  // Garante que o produto que a cliente está vendo sempre aparece, mesmo
  // no caso raro de ter saído do grupo/publicação entre uma consulta e
  // outra — nunca deixa a própria página quebrar por causa disso.
  const members = groupMembers.some((m) => m.id === product.id) ? groupMembers : [product, ...groupMembers];

  const exploreCategories = buildExploreCategoriesItems(categories);

  const pricing = resolveProductPricing(product, paymentSettings);
  const trackedPrice = pricing.model === "dual" ? pricing.cashPrice : pricing.promotionalPrice ?? pricing.price;

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <JsonLd data={buildProductJsonLd(product, paymentSettings, getSiteUrl())} />
      <ProductViewTracker
        productId={product.id}
        categoryId={product.category_id}
        code={product.code}
        price={trackedPrice}
      />
      <BackButton fallbackHref="/novidades" className="mb-4" />

      <ProductDetailView members={members} initialActiveId={product.id} paymentSettings={paymentSettings} sellers={sellers} />

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 font-display text-lg text-text sm:text-xl">Você também pode gostar</h2>
          <ProductGrid products={related} paymentSettings={paymentSettings} />
        </section>
      )}

      <section className="mt-12 min-w-0">
        <h2 className="mb-1 font-display text-lg text-text sm:text-xl">Explorar categorias</h2>
        <p className="mb-4 text-sm text-text-muted">Acesse outras categorias</p>
        <CategoryCarousel items={exploreCategories} variant="paged-grid" />
      </section>
    </main>
  );
}
