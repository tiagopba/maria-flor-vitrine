import type { Metadata } from "next";
import { CategoryCarousel } from "@/components/catalog/CategoryCarousel";
import { FilteredEmptyState } from "@/components/catalog/FilteredEmptyState";
import { ProductFilters } from "@/components/catalog/ProductFilters";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { buildExploreCategoriesItems } from "@/lib/catalog/explore-categories";
import { buildFilterQueryString, hasActiveFilters, parsePublicFilters } from "@/lib/catalog/filters";
import { getCategoryBySlugPublic, getVisibleCategoriesPublic } from "@/lib/db/categories";
import { getAvailableSizesPublic, listPublishedProductsFiltered } from "@/lib/db/products";
import { getPaymentSettings } from "@/lib/site-settings/payments";

export async function generateMetadata({ searchParams }: PageProps<"/novidades">): Promise<Metadata> {
  const rawParams = await searchParams;
  const hasFilters = hasActiveFilters(parsePublicFilters(rawParams));

  return {
    title: "Novidades",
    description:
      "As novidades que você viu nos nossos Stories, agora em um só lugar — moda feminina em Paranaíba, MS.",
    alternates: { canonical: "/novidades" },
    ...(hasFilters ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function NovidadesPage({ searchParams }: PageProps<"/novidades">) {
  const params = await searchParams;
  const filters = parsePublicFilters(params);
  const filtersActive = hasActiveFilters(filters);

  const [category, sizeOptions, categories, paymentSettings] = await Promise.all([
    filters.category ? getCategoryBySlugPublic(filters.category) : Promise.resolve(null),
    getAvailableSizesPublic(),
    getVisibleCategoriesPublic(),
    getPaymentSettings(),
  ]);

  const products = await listPublishedProductsFiltered(
    {
      categoryId: category?.id,
      size: filters.size ?? undefined,
      minPrice: filters.minPrice ?? undefined,
      maxPrice: filters.maxPrice ?? undefined,
    },
    48,
    paymentSettings.cashPriceEnabled
  );

  const exploreCategories = buildExploreCategoriesItems(categories);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-display text-2xl text-text sm:text-3xl">Novidades</h1>

      <div className="mb-6">
        <ProductFilters
          basePath="/novidades"
          initial={filters}
          sizeOptions={sizeOptions}
          categoryOptions={categories.map((c) => ({ slug: c.slug, name: c.name }))}
        />
      </div>

      {products.length === 0 ? (
        filtersActive ? (
          <FilteredEmptyState clearHref={`/novidades${buildFilterQueryString({})}`} />
        ) : (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
            As novidades da Maria Flor aparecem aqui assim que forem publicadas.
          </div>
        )
      ) : (
        <ProductGrid products={products} paymentSettings={paymentSettings} />
      )}

      <section className="mt-12 min-w-0">
        <h2 className="mb-1 font-display text-lg text-text sm:text-xl">Explore por categoria</h2>
        <p className="mb-4 text-sm text-text-muted">Encontre o que combina com você</p>
        <CategoryCarousel items={exploreCategories} />
      </section>
    </main>
  );
}
