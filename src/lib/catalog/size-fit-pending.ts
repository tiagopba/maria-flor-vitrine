// Helpers PUROS (sem server-only, sem Supabase) de "Revisar numerações":
// leitura paginada + a regra de "pendente". Imports com extensão ".ts" de
// propósito: também rodam direto no Node (node --test), sem bundler.

/**
 * O PostgREST do projeto devolve no máximo 1000 linhas por request, sem
 * nenhum erro: uma tabela maior chega truncada em silêncio (foi isso que
 * fez o badge do menu mostrar pendências que não existiam).
 */
export const SIZE_FIT_PAGE_SIZE = 1000;

/** Quantos ids por `.in(...)` — evita uma URL gigantesca quando a lista de produtos cresce. */
export const SIZE_FIT_ID_CHUNK_SIZE = 100;

/** Trava de segurança contra loop infinito (1000 páginas = 1 milhão de linhas, muito além do real). */
const MAX_PAGES = 1000;

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/**
 * Lê TODAS as linhas de uma consulta em blocos de `pageSize` (`.range`),
 * continuando até vir uma página menor que `pageSize`. Quem chama garante
 * ordenação determinística (chave primária) — sem isso, as páginas podem
 * repetir ou pular linhas. Erros devem ser lançados por `fetchPage` (nunca
 * engolidos aqui): uma leitura parcial não pode virar um número "certo".
 */
export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize: number = SIZE_FIT_PAGE_SIZE
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

export interface SizeRow {
  product_id: string;
  size: string;
}

export interface FitRow {
  product_id: string;
  label_size: string;
  fit_size: number;
}

export interface SizeFitLabel {
  /** Texto exatamente como está em product_sizes.size para este produto. */
  labelSize: string;
  /** Numerações marcadas para este label_size — vazio = pendente. */
  fitSizes: number[];
}

/**
 * Carrega `product_sizes` e `product_size_fit_compatibilities` SÓ dos
 * produtos pedidos: ids em lotes (`.in` curto) e cada lote paginado até o
 * fim. Os lotes são disjuntos e a ordenação é por PK, então não há linha
 * repetida nem perdida — nenhuma deduplicação é necessária.
 */
export async function loadSizeFitRows(
  productIds: readonly string[],
  fetchSizesPage: (ids: string[], from: number, to: number) => Promise<SizeRow[]>,
  fetchFitsPage: (ids: string[], from: number, to: number) => Promise<FitRow[]>
): Promise<{ sizes: SizeRow[]; fits: FitRow[] }> {
  const sizes: SizeRow[] = [];
  const fits: FitRow[] = [];

  for (const ids of chunk(productIds, SIZE_FIT_ID_CHUNK_SIZE)) {
    const [sizeRows, fitRows] = await Promise.all([
      fetchAllPages((from, to) => fetchSizesPage(ids, from, to)),
      fetchAllPages((from, to) => fetchFitsPage(ids, from, to)),
    ]);
    sizes.push(...sizeRows);
    fits.push(...fitRows);
  }

  return { sizes, fits };
}

/**
 * Agrupa por produto, na ordem de `sizes`: só entram label_size que existem
 * HOJE em product_sizes (compatibilidade órfã de um tamanho removido é
 * ignorada). Não depende da ordem das linhas recebidas.
 */
export function groupSizeFits(sizes: readonly SizeRow[], fits: readonly FitRow[]): Map<string, SizeFitLabel[]> {
  const fitsByKey = new Map<string, number[]>();
  for (const row of fits) {
    const key = `${row.product_id}::${row.label_size}`;
    const list = fitsByKey.get(key) ?? [];
    list.push(row.fit_size);
    fitsByKey.set(key, list);
  }

  const result = new Map<string, SizeFitLabel[]>();
  for (const row of sizes) {
    const key = `${row.product_id}::${row.size}`;
    const list = result.get(row.product_id) ?? [];
    list.push({ labelSize: row.size, fitSizes: (fitsByKey.get(key) ?? []).slice().sort((a, b) => a - b) });
    result.set(row.product_id, list);
  }
  return result;
}

/** Regra única de "pendente": existe label_size em product_sizes sem nenhuma compatibilidade. */
export function isSizeFitPending(labels: readonly { fitSizes: readonly number[] }[]): boolean {
  return labels.some((l) => l.fitSizes.length === 0);
}

/**
 * Ids de produtos pendentes dentre `activeProductIds` (a população
 * não arquivada). Linhas de produtos fora dessa população são ignoradas.
 */
export function findPendingProductIds(
  activeProductIds: Iterable<string>,
  sizes: readonly SizeRow[],
  fits: readonly FitRow[]
): Set<string> {
  const active = new Set(activeProductIds);
  const grouped = groupSizeFits(
    sizes.filter((s) => active.has(s.product_id)),
    fits.filter((f) => active.has(f.product_id))
  );

  const pending = new Set<string>();
  for (const [productId, labels] of grouped) {
    if (isSizeFitPending(labels)) pending.add(productId);
  }
  return pending;
}
