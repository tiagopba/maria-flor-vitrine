import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Remoção de imagem no Storage. Upload NÃO acontece mais aqui — arquivos
 * vão direto do navegador para o Supabase Storage (ver
 * lib/images/upload-client.ts), porque funções serverless da Vercel
 * recusam requisições acima de 4.5MB (limite de infraestrutura), e uma
 * única foto de celular já pode ultrapassar isso. Remover é uma operação
 * pequena (só o path, sem payload de arquivo), então continua seguro
 * fazer pelo servidor.
 *
 * Usa o client autenticado da própria sessão (não service role): as
 * policies de storage.objects para os buckets 'products'/'categories'
 * (migration 20260827150000) só liberam delete para
 * is_catalog_editor_or_admin() — a autorização real é a RLS do Storage.
 */
export async function deleteImage(bucket: string, path: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.storage.from(bucket).remove([path]);
  if (error) throw new Error(`Falha ao remover imagem do Storage: ${error.message}`);
}
