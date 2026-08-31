import "server-only";
import { createPublicClient } from "@/lib/supabase/public";

export interface SlugRedirectTarget {
  slug: string;
}

/**
 * Resolve /produto/slug-antigo pro slug atual — usado pela página pública
 * quando getProductBySlugPublic não acha nada. Client público (RLS), que
 * já restringe a leitura de product_slug_redirects a produtos ainda
 * visíveis (policy product_slug_redirects_public_read) — se o produto de
 * destino foi arquivado/despublicado, a linha simplesmente não aparece
 * aqui, e a página segue pro 404 normal.
 *
 * A reserva/gravação de slug em si (checagem de colisão, registro do
 * redirect na troca) agora acontece inteiramente dentro da RPC
 * save_product_with_variants (advisory lock + checagem final dentro da
 * transaction) — ver supabase/migrations/*_save_product_with_variants_rpc.sql.
 */
export async function resolveProductSlugRedirect(oldSlug: string): Promise<SlugRedirectTarget | null> {
  const supabase = createPublicClient();

  const { data: redirectRow } = await supabase
    .from("product_slug_redirects")
    .select("product_id")
    .eq("old_slug", oldSlug)
    .maybeSingle();

  if (!redirectRow) return null;

  const { data: product } = await supabase
    .from("products")
    .select("slug")
    .eq("id", redirectRow.product_id)
    .maybeSingle();

  if (!product) return null;
  return { slug: product.slug };
}
