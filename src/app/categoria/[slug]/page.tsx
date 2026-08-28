import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { getCategoryBySlugPublic } from "@/lib/db/categories";

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

      <div className="mx-auto w-full max-w-2xl px-6 py-10 text-center">
        <h1 className="font-display text-3xl text-text">{category.name}</h1>

        <div className="mt-16 flex flex-col items-center gap-2 text-text-muted">
          <p className="max-w-sm">{emptyMessage}</p>
        </div>
      </div>
    </main>
  );
}
