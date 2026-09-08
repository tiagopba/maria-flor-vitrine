/**
 * Ordem de exibição dos tamanhos — puramente de apresentação, nunca altera
 * o que está cadastrado no Supabase (a linha de `product_sizes`/o array
 * `sizes` do produto continua exatamente como veio do banco; isso só decide
 * a ordem de uma cópia pra renderizar). Usado em todo lugar que lista os
 * tamanhos de um produto ("Tamanhos disponíveis" e o modal "Qual tamanho
 * você procura?") — um único ponto de verdade pra ordem, nunca duas regras
 * divergentes.
 */
const LETTER_SIZE_ORDER = ["PP", "P", "M", "G", "GG", "XG", "XGG", "G1", "G2", "G3"];

/**
 * Letras conhecidas primeiro (na ordem de `LETTER_SIZE_ORDER`), depois
 * números em ordem crescente (qualquer numérico, não só a faixa 34–50 do
 * exemplo), depois qualquer valor não reconhecido (ex.: "Único", texto
 * livre) — sempre por último, na ordem relativa em que já vieram do banco
 * (`Array.prototype.sort` é estável), nunca removido.
 */
export function sortProductSizes(sizes: string[]): string[] {
  function rank(size: string): { group: 0 | 1 | 2; order: number } {
    const normalized = size.trim().toUpperCase();
    const letterIndex = LETTER_SIZE_ORDER.indexOf(normalized);
    if (letterIndex !== -1) return { group: 0, order: letterIndex };

    const numeric = Number(normalized);
    if (normalized !== "" && Number.isFinite(numeric)) return { group: 1, order: numeric };

    return { group: 2, order: 0 };
  }

  return [...sizes].sort((a, b) => {
    const rankA = rank(a);
    const rankB = rank(b);
    if (rankA.group !== rankB.group) return rankA.group - rankB.group;
    return rankA.order - rankB.order;
  });
}
