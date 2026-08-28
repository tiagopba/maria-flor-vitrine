import type { Metadata } from "next";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { SearchForm } from "@/components/catalog/SearchForm";
import { searchPublishedProducts } from "@/lib/db/products";

export const metadata: Metadata = { title: "Busca" };

export default async function SearchPage({ searchParams }: PageProps<"/busca">) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : "";

  const products = query ? await searchPublishedProducts(query) : [];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="mb-1 text-center font-display text-xl text-text sm:text-2xl">
        Viu no Instagram? Encontre aqui.
      </h1>
      <p className="mb-6 text-center text-sm text-text-muted">
        Busque pelo nome ou código da peça — ex: 7284, balloon, poá
      </p>

      <SearchForm defaultValue={query} />

      <div className="mt-8">
        {!query ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
            Digite um nome ou código para buscar.
          </div>
        ) : products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
            Nenhuma peça encontrada para &quot;{query}&quot;. Tente outro nome ou código.
          </div>
        ) : (
          <ProductGrid products={products} />
        )}
      </div>
    </main>
  );
}
