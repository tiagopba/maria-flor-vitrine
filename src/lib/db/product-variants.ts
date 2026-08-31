import "server-only";
import { createClient } from "@/lib/supabase/server";
import { deleteImage } from "@/lib/images/provider";
import type { SaveProductVariantsPayload } from "@/lib/validation/product-variants";

const PRODUCTS_BUCKET = "products";

export interface SaveProductWithVariantsResult {
  groupId: string | null;
  variants: { id: string; code: string; slug: string }[];
}

/**
 * Erro controlado vindo da RPC (ou violação de unique constraint) — carrega
 * um `code` estável que a Server Action traduz em mensagem amigável (nunca
 * SQL bruto chega até a admin). Ver tabela de erros no relatório entregue.
 */
export class SaveProductWithVariantsError extends Error {
  code: string;
  constructor(code: string, raw: string) {
    super(raw);
    this.code = code;
  }
}

/**
 * Chama a RPC transacional save_product_with_variants (products,
 * product_sizes, product_images, product_groups e
 * product_slug_redirects gravados atomicamente, com ROLLBACK completo se
 * qualquer etapa falhar). Uploads de foto já aconteceram no Storage antes
 * desta chamada — só os registros no banco passam pela transaction.
 *
 * Só depois da RPC confirmar sucesso é que apagamos do Storage os arquivos
 * que a reconciliação de imagens identificou como removidos
 * (`removed_image_paths`) — nunca dentro da transaction SQL. Falha nessa
 * limpeza não desfaz o salvamento; o banco já é a fonte de verdade, o pior
 * caso é um arquivo órfão sem custo.
 */
export async function saveProductWithVariants(
  payload: SaveProductVariantsPayload
): Promise<SaveProductWithVariantsResult> {
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("save_product_with_variants", { payload });

  if (error) {
    if (error.code === "23505") {
      const dupCode = error.message.includes("products_code_key")
        ? "duplicate_code"
        : error.message.includes("products_slug_key")
          ? "duplicate_slug"
          : "duplicate_key";
      throw new SaveProductWithVariantsError(dupCode, error.message);
    }
    throw new SaveProductWithVariantsError(error.message.split(":")[0].trim(), error.message);
  }

  const result = data;

  for (const path of result.removed_image_paths ?? []) {
    try {
      await deleteImage(PRODUCTS_BUCKET, path);
    } catch (err) {
      console.error(`[saveProductWithVariants] falha ao remover do Storage (${path}):`, err);
    }
  }

  return { groupId: result.group_id, variants: result.variants };
}

/**
 * Chamada quando o salvamento falha DEPOIS de uploads novos já terem ido
 * pro Storage nesta tentativa — remove só esses uploads (o client sabe
 * exatamente quais paths acabou de subir agora; nunca uma foto que já
 * existia antes desta tentativa).
 */
export async function cleanupFailedUploadAttempt(newStoragePaths: string[]): Promise<void> {
  for (const path of newStoragePaths) {
    try {
      await deleteImage(PRODUCTS_BUCKET, path);
    } catch (err) {
      console.error(`[cleanupFailedUploadAttempt] falha ao remover do Storage (${path}):`, err);
    }
  }
}
