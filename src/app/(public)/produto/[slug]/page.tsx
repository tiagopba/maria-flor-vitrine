import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { Price, formatBRL } from "@/components/ui/Price";
import { BackButton } from "@/components/layout/BackButton";
import { CategoryCarousel } from "@/components/catalog/CategoryCarousel";
import { FavoriteButton } from "@/components/catalog/FavoriteButton";
import { ProductGallery } from "@/components/catalog/ProductGallery";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { ProductWhatsAppFlow } from "@/components/catalog/ProductWhatsAppFlow";
import { buildExploreCategoriesItems } from "@/lib/catalog/explore-categories";
import { resolveProductPricing } from "@/lib/catalog/pricing";
import { PRODUCT_STATUS_LABELS, publicStatusBadge } from "@/lib/catalog/status";
import { getVisibleCategoriesPublic } from "@/lib/db/categories";
import { getProductBySlugPublic, getRelatedProductsPublic } from "@/lib/db/products";
import { getActiveSellersForModal } from "@/lib/db/sellers";
import { getPaymentSettings } from "@/lib/site-settings/payments";

export async function generateMetadata({
  params,
}: PageProps<"/produto/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlugPublic(slug);

  if (!product) return {};

  const title = `${product.name} | Maria Flor`;
  const description = product.description ?? `${product.name} — Código ${product.code}. Confira na Vitrine Maria Flor.`;
  const image = product.images[0]?.url;

  return {
    title: product.name,
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

  if (!product) notFound();

  const [sellers, related, categories, paymentSettings] = await Promise.all([
    getActiveSellersForModal(),
    getRelatedProductsPublic(product.id, product.category_id),
    getVisibleCategoriesPublic(),
    getPaymentSettings(),
  ]);

  const badge = publicStatusBadge(product.status);
  const isSoldOut = product.status === "SOLD_OUT";
  const exploreCategories = buildExploreCategoriesItems(categories);
  const pricing = resolveProductPricing(product, paymentSettings);

  return (
    <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-8 sm:px-6">
      <BackButton fallbackHref="/novidades" className="mb-4" />

      <div className="grid gap-8 sm:grid-cols-2">
        <ProductGallery images={product.images} productName={product.name} />

        <div className="flex flex-col gap-4">
          {product.categoryName && (
            <p className="text-xs uppercase tracking-wide text-text-muted">{product.categoryName}</p>
          )}

          <div className="flex items-start justify-between gap-3">
            <h1 className="font-display text-2xl text-text sm:text-3xl">{product.name}</h1>
            <FavoriteButton productId={product.id} className="shrink-0 bg-muted hover:bg-border" />
          </div>

          <div className="flex items-start gap-2">
            {pricing.model === "dual" ? (
              <div className="flex flex-col gap-1">
                <span className="font-display text-2xl text-text">{formatBRL(pricing.cashPrice)} no Pix</span>
                <span className="text-xs text-text-muted">com desconto à vista</span>
                <span className="mt-2 text-lg text-text">{formatBRL(pricing.cardPrice)} no cartão</span>
                {pricing.installmentCount != null && (
                  <span className="text-xs text-text-muted">em até {pricing.installmentCount}x sem juros</span>
                )}
              </div>
            ) : (
              <Price product={product} paymentSettings={paymentSettings} />
            )}
            {badge && <Badge tone="warning">{badge}</Badge>}
          </div>

          <p className="text-xs text-text-muted">Código: {product.code}</p>

          {isSoldOut && (
            <p className="text-sm font-medium text-red-600">{PRODUCT_STATUS_LABELS.SOLD_OUT}</p>
          )}

          {product.description && (
            <p className="whitespace-pre-line text-sm text-text-muted">{product.description}</p>
          )}

          <p className="text-xs text-text-muted">
            Disponibilidade sujeita à confirmação devido ao giro rápido das peças.
          </p>

          <div className="mt-2">
            <ProductWhatsAppFlow
              productId={product.id}
              status={product.status}
              sizes={product.sizes}
              sellers={sellers}
            />
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 font-display text-lg text-text sm:text-xl">Você também pode gostar</h2>
          <ProductGrid products={related} paymentSettings={paymentSettings} />
        </section>
      )}

      <section className="mt-12 min-w-0">
        <h2 className="mb-1 font-display text-lg text-text sm:text-xl">Explorar categorias</h2>
        <p className="mb-4 text-sm text-text-muted">Acesse outras categorias</p>
        <CategoryCarousel items={exploreCategories} />
      </section>
    </main>
  );
}
