import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { CategoryCard } from "@/components/catalog/CategoryCard";
import { HomeSearch } from "@/components/catalog/HomeSearch";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import { getVisibleCategoriesPublic } from "@/lib/db/categories";
import { listPublishedProducts } from "@/lib/db/products";

export default async function Home() {
  const [novidades, categorias] = await Promise.all([
    listPublishedProducts(8),
    getVisibleCategoriesPublic(),
  ]);

  return (
    <main className="flex flex-1 flex-col">
      {/* Hero */}
      <section className="px-4 py-10 text-center sm:py-14">
        <h1 className="mx-auto max-w-md font-display text-xl text-text sm:text-3xl">
          As novidades que você viu nos nossos Stories, agora em um só lugar.
        </h1>
        <Link href="/novidades">
          <Button className="mt-5">Ver novidades</Button>
        </Link>
      </section>

      {/* Busca */}
      <section className="border-y border-border bg-muted/50 px-4 py-8 sm:px-6">
        <h2 className="mb-4 text-center font-display text-lg text-text sm:text-xl">
          Viu no Instagram? Encontre aqui.
        </h2>
        <HomeSearch />
      </section>

      {/* Acabaram de chegar */}
      <section className="px-4 py-8 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-display text-lg text-text sm:text-xl">Acabaram de chegar</h2>
          <Link href="/novidades" className="text-sm font-medium text-primary">
            Ver todas
          </Link>
        </div>

        {novidades.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
            As novidades da Maria Flor aparecem aqui assim que forem publicadas.
          </div>
        ) : (
          <ProductGrid products={novidades} />
        )}
      </section>

      {/* Categorias */}
      {categorias.length > 0 && (
        <section className="px-4 py-8 sm:px-6">
          <h2 className="mb-4 font-display text-lg text-text sm:text-xl">Categorias</h2>
          <div className="grid grid-cols-3 gap-x-4 gap-y-5 sm:grid-cols-4 md:grid-cols-6">
            {categorias.map((categoria) => (
              <CategoryCard key={categoria.id} category={categoria} />
            ))}
          </div>
        </section>
      )}

      {/* Chamadas institucionais — discretas, sem popup nem virar página de banners */}
      <section className="grid gap-4 px-4 py-8 sm:grid-cols-2 sm:px-6">
        <div className="flex flex-col items-start gap-2 rounded-2xl border border-border p-5">
          <h2 className="font-display text-base text-text">Quer receber nossas ofertas?</h2>
          <p className="text-sm text-text-muted">
            Entre para nosso grupo e acompanhe promoções e novidades.
          </p>
          <Link href="/ofertas" className="mt-1">
            <Button variant="secondary" className="h-11">
              Quero entrar
            </Button>
          </Link>
        </div>

        <div className="flex flex-col items-start gap-2 rounded-2xl border border-border p-5">
          <h2 className="font-display text-base text-text">Prefere visitar a loja?</h2>
          <p className="text-sm text-text-muted">Venha nos conhecer pessoalmente em Paranaíba/MS.</p>
          <Link href="/como-chegar" className="mt-1">
            <Button variant="secondary" className="h-11">
              Como chegar
            </Button>
          </Link>
        </div>
      </section>
    </main>
  );
}
