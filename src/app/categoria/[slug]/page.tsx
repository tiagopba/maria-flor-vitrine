import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { getCategoryBySlugPublic } from "@/lib/db/categories";
import { listPublishedProductsByCategory } from "@/lib/db/products";

export async function generateMetadata({
  params,
}: PageProps<"/categoria/[slug]">): Promise<Metadata> {
  const { slug } = await params;
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

export default async function CategoryPage({ params }: PageProps<"/categoria/[slug]">) {
  const { slug } = await params;
  const category = await getCategoryBySlugPublic(slug);

  if (!category) notFound();

  const products = await listPublishedProductsByCategory(category.id);

  const emptyMessage =
    category.description ??
    `As novidades em ${category.name.toLowerCase()} da Maria Flor aparecem aqui.`;

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

        {products.length === 0 ? (
          <div className="mt-10 flex flex-col items-center gap-2 py-10 text-center text-text-muted">
            <p className="max-w-sm">{emptyMessage}</p>
          </div>
        ) : (
          <ProductGrid products={products} />
        )}
      </div>
    </main>
  );
}
