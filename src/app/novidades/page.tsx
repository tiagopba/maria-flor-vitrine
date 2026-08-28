import type { Metadata } from "next";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { listPublishedProducts } from "@/lib/db/products";

export const metadata: Metadata = {
  title: "Novidades",
  description: "As novidades que você viu nos nossos Stories, agora em um só lugar.",
};

export default async function NovidadesPage() {
  const products = await listPublishedProducts(48);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-display text-2xl text-text sm:text-3xl">Novidades</h1>

      {products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          As novidades da Maria Flor aparecem aqui assim que forem publicadas.
        </div>
      ) : (
        <ProductGrid products={products} />
      )}
    </main>
  );
}
