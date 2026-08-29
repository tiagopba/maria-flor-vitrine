import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { Price } from "@/components/ui/Price";
import { publicStatusBadge } from "@/lib/catalog/status";
import { getProductsByIdsPublic } from "@/lib/db/products";
import { getSharedSelection } from "@/lib/db/shared-selections";
import { recordSelectionViewed } from "@/lib/selections/analytics";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const selection = await getSharedSelection(token);
  if (!selection) return { title: "Seleção de peças" };

  const products = await getProductsByIdsPublic(selection.items.map((i) => i.product_id));
  const image = products[0]?.images[0]?.url;

  return {
    title: "Seleção de peças",
    description: "Veja as peças selecionadas na Vitrine Maria Flor.",
    openGraph: {
      title: "Seleção de peças | Maria Flor",
      description: "Veja as peças selecionadas na Vitrine Maria Flor.",
      images: image ? [image] : undefined,
    },
  };
}

export default async function SharedSelectionPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const selection = await getSharedSelection(token);

  if (!selection) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
        <p className="font-display text-lg text-text">Esta seleção não está mais disponível.</p>
      </main>
    );
  }

  const sizeByProductId = new Map(selection.items.map((i) => [i.product_id, i.selected_size]));
  const products = await getProductsByIdsPublic(selection.items.map((i) => i.product_id));

  // Não bloqueia a renderização — a vendedora precisa ver a seleção mesmo
  // se o registro do evento falhar (ex: migration ainda não aplicada).
  void recordSelectionViewed(token, products.length);

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <p className="font-display text-lg text-primary">Maria Flor</p>
      <h1 className="mt-1 font-display text-2xl text-text sm:text-3xl">Seleção enviada por uma cliente</h1>

      {products.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          As peças dessa seleção não estão mais disponíveis.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          {products.map((product) => {
            const badge = publicStatusBadge(product.status);
            const mainImage = product.images[0]?.url ?? null;
            const size = sizeByProductId.get(product.id);

            return (
              <Link
                key={product.id}
                href={`/produto/${product.slug}`}
                className="flex gap-3 rounded-2xl border border-border bg-surface p-3"
              >
                <div className="relative h-28 w-24 shrink-0 overflow-hidden rounded-xl bg-muted sm:h-32 sm:w-28">
                  {mainImage ? (
                    <Image src={mainImage} alt={product.name} fill sizes="120px" className="object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-text-muted">Sem foto</div>
                  )}
                </div>

                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <p className="truncate text-sm font-medium text-text">{product.name}</p>
                  <p className="text-xs text-text-muted">Código: {product.code}</p>
                  {size && (
                    <p className="text-xs text-text">
                      Tamanho: <span className="font-medium">{size}</span>
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <Price price={product.price} promotionalPrice={product.promotional_price} />
                    {badge && <Badge tone="warning">{badge}</Badge>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
