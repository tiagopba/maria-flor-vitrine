// Leitura paginada e opções de filtro — PUROS (rodam no Node, sem Supabase).
//
// O PostgREST do projeto devolve no máximo 1000 linhas por request SEM erro:
// uma leitura única trunca em silêncio. Aqui toda leitura grande é paginada
// com `.range()` em ordem determinística (PK) até vir uma página incompleta.

export const PAGE_SIZE = 1000;

/** Trava contra loop infinito (1000 páginas = 1 milhão de linhas, muito além do real). */
const MAX_PAGES = 1000;

/** Erros de `fetchPage` devem ser LANÇADOS: leitura parcial nunca pode virar resultado "certo". */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize: number = PAGE_SIZE
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * pageSize;
    const rows = await fetchPage(from, from + pageSize - 1);
    all.push(...rows);
    if (rows.length < pageSize) return all;
  }
  throw new Error("Leitura paginada excedeu o limite de páginas.");
}

export interface FilterOptionRow {
  sales_origin: string | null;
  carrier: string | null;
}

/** Valores distintos e ordenados de origem e transportadora (só essas duas colunas — nenhum dado pessoal). */
export function collectFilterOptions(rows: readonly FilterOptionRow[]): { origins: string[]; carriers: string[] } {
  const origins = new Set<string>();
  const carriers = new Set<string>();
  for (const row of rows) {
    if (row.sales_origin) origins.add(row.sales_origin);
    if (row.carrier) carriers.add(row.carrier);
  }
  return { origins: [...origins].sort(), carriers: [...carriers].sort() };
}
