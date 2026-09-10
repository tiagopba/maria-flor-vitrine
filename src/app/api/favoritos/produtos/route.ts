import { NextResponse, type NextRequest } from "next/server";
import { getProductsByIdsPublic } from "@/lib/db/products";

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
 * Só recebe ids; nenhuma lógica de produto é duplicada aqui.
 */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const idsParam = request.nextUrl.searchParams.get("ids") ?? "";
  const ids = idsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  const products = await getProductsByIdsPublic(ids);

  return NextResponse.json(products, { headers: { "Cache-Control": "no-store" } });
}
