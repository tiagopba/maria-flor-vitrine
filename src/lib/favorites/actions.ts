"use server";

import { getProductsByIdsPublic, type ProductDetail } from "@/lib/db/products";

/**
 * Ponte para a página /favoritos (Client Component, já que os ids só
 * existem no localStorage do navegador) chamar a busca em lote existente
 * em lib/db/products.ts sem importar um módulo "server-only" direto de um
 * Client Component.
 */
export async function getFavoriteProductsAction(ids: string[]): Promise<ProductDetail[]> {
  return getProductsByIdsPublic(ids);
}
