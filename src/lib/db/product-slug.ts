import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createPublicClient } from "@/lib/supabase/public";
import { buildProductSlugBase, withSlugSuffix } from "@/lib/catalog/product-slug";

/**
 * Mensagem amigável — nunca mostrar erro de constraint/SQL pra admin.
 * Lançado só quando o slug antigo que o produto está deixando pra trás
 * já pertence, no histórico, a OUTRO produto — nunca transferimos esse
 * histórico silenciosamente.
 */
export class SlugRedirectOwnedByAnotherProductError extends Error {
  constructor() {
    super(
      "Não foi possível atualizar o link desta peça porque o endereço anterior está associado ao histórico de outro produto."
    );
  }
}

/**
 * "Reserva global" de slug: um endereço é considerado ocupado se estiver
 * em products.slug OU em product_slug_redirects.old_slug (de qualquer
 * produto) — nunca deixamos um produto novo roubar o histórico de URL de
 * outro. excludeProductId ignora o próprio produto sendo editado (voltar
 * ao próprio slug atual, ou a um slug que já foi dele antes, não conta
 * como colisão).
 */
async function isSlugTaken(slug: string, excludeProductId?: string): Promise<boolean> {
  const supabase = await createClient();

  let productQuery = supabase.from("products").select("id").eq("slug", slug).limit(1);
  if (excludeProductId) productQuery = productQuery.neq("id", excludeProductId);
  const { data: productRows, error: productError } = await productQuery;
  if (productError) throw new Error(productError.message);
  if ((productRows ?? []).length > 0) return true;

  let redirectQuery = supabase.from("product_slug_redirects").select("product_id").eq("old_slug", slug).limit(1);
  if (excludeProductId) redirectQuery = redirectQuery.neq("product_id", excludeProductId);
  const { data: redirectRows, error: redirectError } = await redirectQuery;
  if (redirectError) throw new Error(redirectError.message);
  return (redirectRows ?? []).length > 0;
}

/**
 * Gera o slug automático (nome-código-cor) e resolve colisão sozinho,
 * tentando -2, -3... até achar um livre. Como `code` já é único no
 * banco, uma colisão do slug-base é praticamente impossível — o loop
 * existe pra cobrir o caso extraordinário (ex: dois códigos que só
 * diferem em pontuação e caem no mesmo slug depois de normalizados).
 */
export async function resolveAutoProductSlug(params: {
  name: string;
  code: string;
  colorName?: string | null;
  excludeProductId?: string;
}): Promise<string> {
  const base = buildProductSlugBase(params.name, params.code, params.colorName);
  let n = 1;
  while (n < 50) {
    const candidate = withSlugSuffix(base, n);
    if (!(await isSlugTaken(candidate, params.excludeProductId))) return candidate;
    n++;
  }
  throw new Error("Não foi possível gerar um endereço único para este produto.");
}

/** Slug digitado manualmente pela admin — só diz se está livre, nunca gera alternativa sozinho. */
export async function isManualProductSlugAvailable(slug: string, excludeProductId?: string): Promise<boolean> {
  return !(await isSlugTaken(slug, excludeProductId));
}

/**
 * Roda ANTES de qualquer escrita em products, quando o slug de um
 * produto existente vai mudar — garante que registrar o slug antigo como
 * redirect não vai pisar no histórico de outro produto. Lançar aqui
 * impede a operação inteira de começar, então nunca existe um produto
 * "salvo pela metade": ou tudo passa (update + redirect), ou nada é
 * escrito. Chamado de dentro de updateProduct (lib/db/products.ts), com
 * o mesmo client usado pro UPDATE em si.
 */
export async function assertSlugRedirectAvailable(
  supabase: Awaited<ReturnType<typeof createClient>>,
  oldSlug: string,
  productId: string
): Promise<void> {
  const { data, error } = await supabase
    .from("product_slug_redirects")
    .select("product_id")
    .eq("old_slug", oldSlug)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data && data.product_id !== productId) {
    throw new SlugRedirectOwnedByAnotherProductError();
  }
}

/**
 * Registra a troca de slug — chamado só DEPOIS que o UPDATE em products
 * já teve sucesso (assertSlugRedirectAvailable já garantiu antes que não
 * há conflito com outro produto). Duas coisas:
 *   1. se o novo slug já foi um slug antigo DESTE MESMO produto, apaga
 *      esse redirect (senão o slug atual redirecionaria pra si mesmo);
 *   2. grava o slug que está sendo deixado pra trás como redirect —
 *      idempotente se, por algum motivo, essa linha já existir pra este
 *      produto.
 */
export async function recordSlugChange(
  supabase: Awaited<ReturnType<typeof createClient>>,
  productId: string,
  oldSlug: string,
  newSlug: string
): Promise<void> {
  if (oldSlug === newSlug) return;

  const { error: deleteError } = await supabase
    .from("product_slug_redirects")
    .delete()
    .eq("old_slug", newSlug)
    .eq("product_id", productId);
  if (deleteError) throw new Error(deleteError.message);

  const { data: existing, error: existingError } = await supabase
    .from("product_slug_redirects")
    .select("id")
    .eq("old_slug", oldSlug)
    .eq("product_id", productId)
    .maybeSingle();
  if (existingError) throw new Error(existingError.message);
  if (existing) return;

  const { error: insertError } = await supabase
    .from("product_slug_redirects")
    .insert({ product_id: productId, old_slug: oldSlug });
  if (insertError) throw new Error(insertError.message);
}

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
