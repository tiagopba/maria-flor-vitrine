import { NextResponse, type NextRequest } from "next/server";
import { getProductsByIdsPublic } from "@/lib/db/products";
import { getSizeFitCompatibilityByProductIdsPublic } from "@/lib/db/product-size-fit";

/**
 * Busca os produtos de Minhas Roupas (mesma getProductsByIdsPublic de
 * sempre — produtos + imagens + tamanhos + categoria + cor, em lote, nunca
 * N+1, mesma RLS pública de qualquer listagem) — exposta como Route Handler
 * em vez de Server Action.
 *
 * Motivo (ver auditoria de performance de /favoritos): Server Actions
 * chamadas pelo client entram numa fila do App Router que o Next despacha
 * uma de cada vez, mesmo sem `await` nenhum ligando as chamadas entre si —
 * então essa busca (a única de que a tela realmente depende pra sair do
 * loading) ficava atrás de FAVORITES_VIEW/PAGE_VIEW/etc na mesma fila.
 * `fetch()` comum não entra nessa fila — roda em paralelo de verdade.
 *
 * `fitCompatibility` (Etapa 2 — vestibilidade pública) vai no MESMO payload,
 * buscado em paralelo com os produtos a partir dos MESMOS ids da query
 * string (não depende do resultado de getProductsByIdsPublic) — nunca um
 * segundo fetch do client, nunca N+1. O client (FavoriteProductRow) decide
 * sozinho qual entrada usar (só a do `selected_size` daquela peça).
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const idsParam = request.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const [products, fitCompatibilityMap] = await Promise.all([
    getProductsByIdsPublic(ids),
    getSizeFitCompatibilityByProductIdsPublic(ids),
  ]);

  const productsWithFit = products.map((product) => ({
    ...product,
    fitCompatibility: Object.fromEntries(
      (fitCompatibilityMap.get(product.id) ?? []).map((l) => [l.labelSize, l.fitSizes])
    ),
  }));

  return NextResponse.json(productsWithFit, { headers: { "Cache-Control": "no-store" } });
}
