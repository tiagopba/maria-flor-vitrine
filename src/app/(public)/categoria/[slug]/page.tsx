import type { Metadata } from "next";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { CategoryCarousel } from "@/components/catalog/CategoryCarousel";
import { FilteredEmptyState } from "@/components/catalog/FilteredEmptyState";
import { ProductFilters } from "@/components/catalog/ProductFilters";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { buildExploreCategoriesItems } from "@/lib/catalog/explore-categories";
import { buildFilterQueryString, hasActiveFilters, parsePublicFilters } from "@/lib/catalog/filters";
import { getCategoryBySlugPublic, getVisibleCategoriesPublic } from "@/lib/db/categories";
import { getAvailableSizesPublic, listPublishedProductsFiltered } from "@/lib/db/products";

// "novidades" é seção especial (rota própria /novidades), não uma
// categoria de catálogo comum — ver lib/db/categories.ts. Continua
// existindo no banco (não apagamos a categoria), só não tem página
// própria em /categoria/novidades: qualquer link antigo pra cá redireciona.
const SPECIAL_CATEGORY_REDIRECTS: Record<string, string> = {
  novidades: "/novidades",
};

export async function generateMetadata({
  params,
}: PageProps<"/categoria/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  if (SPECIAL_CATEGORY_REDIRECTS[slug]) redirect(SPECIAL_CATEGORY_REDIRECTS[slug]);

  const category = await getCategoryBySlugPublic(slug);

  if (!category) return {};

  const description =
    category.description ??
    `As novidades em ${category.name.toLowerCase()} da Maria Flor aparecem aqui.`;

  return {
    title: category.name,
    description,
    openGraph: {
      title: category.name,
      description,
      images: category.cover_image ? [category.cover_image] : undefined,
    },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/categoria/[slug]">) {
  const { slug } = await params;
  if (SPECIAL_CATEGORY_REDIRECTS[slug]) redirect(SPECIAL_CATEGORY_REDIRECTS[slug]);

  const category = await getCategoryBySlugPublic(slug);

  if (!category) notFound();

  const rawParams = await searchParams;
  const filters = parsePublicFilters(rawParams);
  const filtersActive = hasActiveFilters(filters);

  const [products, sizeOptions, categories] = await Promise.all([
    listPublishedProductsFiltered({
      categoryId: category.id,
      size: filters.size ?? undefined,
      minPrice: filters.minPrice ?? undefined,
      maxPrice: filters.maxPrice ?? undefined,
    }),
    getAvailableSizesPublic(),
    getVisibleCategoriesPublic(),
  ]);

  const emptyMessage =
    category.description ??
    `As novidades em ${category.name.toLowerCase()} da Maria Flor aparecem aqui.`;
  const exploreCategories = buildExploreCategoriesItems(categories);

  return (
    <main className="flex flex-1 flex-col">
      {category.cover_image && (
        <div className="relative h-40 w-full sm:h-56">
          <Image
            src={category.cover_image}
            alt=""
            fill
            priority
            className="object-cover"
            sizes="100vw"
          />
        </div>
      )}

      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <h1 className="mb-6 font-display text-2xl text-text sm:text-3xl">{category.name}</h1>

        <div className="mb-6">
          <ProductFilters basePath={`/categoria/${slug}`} initial={filters} sizeOptions={sizeOptions} />
        </div>

        {products.length === 0 ? (
          filtersActive ? (
            <FilteredEmptyState clearHref={`/categoria/${slug}${buildFilterQueryString({})}`} />
          ) : (
            <div className="mt-10 flex flex-col items-center gap-2 py-10 text-center text-text-muted">
              <p className="max-w-sm">{emptyMessage}</p>
            </div>
          )
        ) : (
          <ProductGrid products={products} />
        )}

        <section className="mt-12 min-w-0">
          <h2 className="mb-1 font-display text-lg text-text sm:text-xl">Explore por categoria</h2>
          <p className="mb-4 text-sm text-text-muted">Encontre o que combina com você</p>
          <CategoryCarousel items={exploreCategories} />
        </section>
      </div>
    </main>
  );
}
