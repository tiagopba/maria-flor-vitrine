import { buildMetaCatalogFeed } from "@/lib/feeds/meta-catalog";

// Mesmo motivo do sitemap/robots dinâmicos: sem isso o feed ficaria
// congelado no HTML/response do último deploy, sem refletir produtos
// cadastrados/arquivados depois — a Meta precisa sempre ver o catálogo
// real e atual.
export const dynamic = "force-dynamic";

export async function GET() {
  const { csv } = await buildMetaCatalogFeed();

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
