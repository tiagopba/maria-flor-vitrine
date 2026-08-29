import type { Metadata } from "next";
import { getActiveSellersForModal } from "@/lib/db/sellers";
import { FavoritesPageClient } from "./FavoritesPageClient";

// noindex: página pessoal (o conteúdo depende do localStorage de cada
// cliente) — não há nada de único para o Google indexar aqui.
export const metadata: Metadata = {
  title: "Meus Favoritos",
  robots: { index: false, follow: true },
};

// Sem isso, a página (sem segmento dinâmico) é estaticamente otimizada no
// build — a lista de vendedoras ficaria congelada no deploy, sem refletir
// ativar/desativar vendedora feito depois no admin.
export const dynamic = "force-dynamic";

export default async function FavoritosPage() {
  const sellers = await getActiveSellersForModal();

  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="font-display text-2xl text-text sm:text-3xl">Meus Favoritos</h1>
      <p className="mt-1 mb-6 text-sm text-text-muted">
        Separe as peças que você gostou e envie sua seleção para uma de nossas vendedoras.
      </p>

      <FavoritesPageClient sellers={sellers} />
    </main>
  );
}
