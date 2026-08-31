import type { Metadata } from "next";
import { CategoryCarousel } from "@/components/catalog/CategoryCarousel";
import { FilteredEmptyState } from "@/components/catalog/FilteredEmptyState";
import { GroupedProductGrid } from "@/components/catalog/GroupedProductGrid";
import { ProductFilters } from "@/components/catalog/ProductFilters";
import { SearchForm } from "@/components/catalog/SearchForm";
import { buildExploreCategoriesItems } from "@/lib/catalog/explore-categories";
import { buildFilterQueryString, hasActiveFilters, parsePublicFilters } from "@/lib/catalog/filters";
import { groupProductsForDisplay } from "@/lib/catalog/group-products-for-display";
import { getCategoryBySlugPublic, getVisibleCategoriesPublic } from "@/lib/db/categories";
import { getAvailableSizesPublic, listPublishedProductsFiltered } from "@/lib/db/products";
import { getPaymentSettings } from "@/lib/site-settings/payments";

export const metadata: Metadata = { title: "Busca" };

export default async function SearchPage({ searchParams }: PageProps<"/busca">) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";
  const filters = parsePublicFilters(params);
  const filtersActive = hasActiveFilters(filters);
  const shouldSearch = Boolean(query) || filtersActive;

  const [category, sizeOptions, categories, paymentSettings] = await Promise.all([
    filters.category ? getCategoryBySlugPublic(filters.category) : Promise.resolve(null),
    getAvailableSizesPublic(),
    getVisibleCategoriesPublic(),
    getPaymentSettings(),
  ]);

  const products = shouldSearch
    ? await listPublishedProductsFiltered(
        {
          q: query || undefined,
          categoryId: category?.id,
          size: filters.size ?? undefined,
          minPrice: filters.minPrice ?? undefined,
          maxPrice: filters.maxPrice ?? undefined,
        },
        undefined,
        paymentSettings.cashPriceEnabled
      )
    : [];

  const exploreCategories = buildExploreCategoriesItems(categories);

  // Busca por código precisa sempre achar a variante exata — nunca some
  // escondida atrás de outra cor do mesmo modelo escolhida como
  // representante do card (item 8 da especificação). Busca por nome/
  // descrição continua agrupando normalmente.
  const trimmedQuery = query.trim().toLowerCase();
  const groups = trimmedQuery
    ? groupProductsForDisplay(products, {
        keepStandalone: (p) => p.code.toLowerCase().includes(trimmedQuery),
      })
    : groupProductsForDisplay(products);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-center font-display text-xl text-text sm:text-2xl">
        Viu no Instagram? Encontre aqui.
      </h1>
      <p className="mb-6 text-center text-sm text-text-muted">
        Busque pelo nome ou código da peça — ex: 7284, balloon, poá
      </p>

      <SearchForm defaultValue={query} />

      <div className="mt-5">
        <ProductFilters
          basePath="/busca"
          initial={filters}
          sizeOptions={sizeOptions}
          categoryOptions={categories.map((c) => ({ slug: c.slug, name: c.name }))}
          preserveParams={{ q: query || undefined }}
        />
      </div>

      <div className="mt-8">
        {!shouldSearch ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
            Digite um nome ou código para buscar, ou use os filtros acima.
          </div>
        ) : products.length === 0 ? (
          filtersActive ? (
            <FilteredEmptyState clearHref={`/busca${buildFilterQueryString({}, { q: query || undefined })}`} />
          ) : (
            <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
              Nenhuma peça encontrada para &quot;{query}&quot;. Tente outro nome ou código.
            </div>
          )
        ) : (
          <GroupedProductGrid groups={groups} paymentSettings={paymentSettings} />
        )}
      </div>

      <section className="mt-12 min-w-0">
        <h2 className="mb-1 font-display text-lg text-text sm:text-xl">Explore por categoria</h2>
        <p className="mb-4 text-sm text-text-muted">Encontre o que combina com você</p>
        <CategoryCarousel items={exploreCategories} />
      </section>
    </main>
  );
}
