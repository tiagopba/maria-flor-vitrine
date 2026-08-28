"use client";

import { createClient } from "@/lib/supabase/client";
import { publicImageUrl } from "@/lib/images/url";
import { imageExtensionFor, validateImageFile } from "@/lib/images/validation";

export { validateImageFile };

export interface UploadedImage {
  path: string;
  url: string;
}

/**
 * Upload direto do navegador para o Supabase Storage — o arquivo NUNCA
 * passa pela Vercel. Isso é necessário porque funções serverless da Vercel
 * recusam requisições acima de 4.5MB (limite de infraestrutura, não dá pra
 * configurar), e uma foto de celular sozinha já pode passar disso.
 *
 * A autorização real é a RLS do Storage (policies de
 * is_catalog_editor_or_admin() nos buckets 'products'/'categories',
 * migration 20260827150000) — o client aqui usa a sessão autenticada da
 * própria admin/catalog_editor, nunca service role.
 */
export async function uploadImageDirect(bucket: string, file: File): Promise<UploadedImage> {
  const supabase = createClient();
  const path = `${crypto.randomUUID()}.${imageExtensionFor(file)}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    contentType: file.type,
  });

  if (error) throw new Error(`Falha no upload: ${error.message}`);

  return { path, url: publicImageUrl(bucket, path) };
}
