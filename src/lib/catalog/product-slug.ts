import { slugify } from "@/lib/utils";

/**
 * Monta o slug de um produto: nome + código + cor (cor só entra quando
 * informada). Puro, sem acesso a banco — usado no preview ao vivo do
 * formulário (client). Como `code` já é único no banco, uma colisão deste
 * resultado com outro produto é praticamente impossível por construção; a
 * checagem final (bloqueio, nunca sufixo automático) acontece dentro da
 * transaction da RPC save_product_with_variants.
 *
 * Exemplo: nome "Calça Pantalona Jeans", código "479", cor "Azul Royal"
 * → "calca-pantalona-jeans-479-azul-royal".
 */
export function buildProductSlugBase(name: string, code: string, colorName?: string | null): string {
  const parts = [slugify(name), slugify(code)];
  if (colorName && colorName.trim() !== "") parts.push(slugify(colorName));
  return parts.filter(Boolean).join("-");
}
