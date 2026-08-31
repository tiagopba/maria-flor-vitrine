import { slugify } from "@/lib/utils";

/**
 * Monta o slug-base de um produto: nome + código + cor (cor só entra
 * quando informada). Puro, sem acesso a banco — usado tanto no preview
 * ao vivo do formulário (client) quanto como ponto de partida da
 * resolução de unicidade no servidor (lib/db/product-slug.ts), que é
 * quem garante que o resultado final não colide com nenhum produto nem
 * redirect histórico.
 *
 * Exemplo: nome "Calça Pantalona Jeans", código "479", cor "Azul Royal"
 * → "calca-pantalona-jeans-479-azul-royal".
 */
export function buildProductSlugBase(name: string, code: string, colorName?: string | null): string {
  const parts = [slugify(name), slugify(code)];
  if (colorName && colorName.trim() !== "") parts.push(slugify(colorName));
  return parts.filter(Boolean).join("-");
}

/**
 * Acrescenta o sufixo de desempate (`-2`, `-3`, ...) — só usado quando o
 * slug-base já está ocupado por outro produto ou por um redirect
 * histórico de outro produto (ver resolveUniqueProductSlug).
 */
export function withSlugSuffix(base: string, n: number): string {
  return n <= 1 ? base : `${base}-${n}`;
}
