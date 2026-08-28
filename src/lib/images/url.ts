/**
 * URL pública de um objeto no Supabase Storage, construída sem round-trip
 * de rede (o bucket é público, então a URL é determinística). Segura para
 * uso em client ou server — usa apenas a URL pública do projeto.
 */
export function publicImageUrl(bucket: string, path: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${base}/storage/v1/object/public/${bucket}/${path}`;
}
