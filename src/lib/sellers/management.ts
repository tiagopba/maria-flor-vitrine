// Regras PURAS da gestão de vendedoras (sem server-only, sem Supabase) — rodam
// direto no Node (node --test). Imports com extensão ".ts" de propósito.

export interface SellerLike {
  id: string;
  name: string;
  active: boolean;
}

const DIACRITICS = /[̀-ͯ]/g;

/** Caixa baixa, sem acento e com espaços colapsados — só para comparar nomes. */
export function normalizeSellerName(name: string): string {
  return name.normalize("NFD").replace(DIACRITICS, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Nome limpo para gravar: espaços das pontas e duplicados removidos (mantém caixa e acentos). */
export function cleanSellerName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

/**
 * Já existe OUTRA vendedora (ativa ou inativa) com este nome? Evita criar uma
 * "nova" pessoa que na verdade é uma antiga (para essa, o certo é REATIVAR) e
 * evita dois cadastros iguais. `exceptId` ignora a própria vendedora ao renomear.
 */
export function findNameConflict<T extends SellerLike>(
  name: string,
  sellers: readonly T[],
  exceptId?: string
): T | null {
  const target = normalizeSellerName(name);
  if (!target) return null;
  return sellers.find((s) => s.id !== exceptId && normalizeSellerName(s.name) === target) ?? null;
}

/** Quem pode ser escolhida para uma NOVA venda: só vendedoras ativas. */
export function selectableSellers<T extends SellerLike>(sellers: readonly T[]): T[] {
  return sellers.filter((s) => s.active);
}

/** id → nome para exibir HISTÓRICO: inclui inativas (o nome nunca some de um registro antigo). */
export function sellerNameMap(sellers: readonly SellerLike[]): Record<string, string> {
  return Object.fromEntries(sellers.map((s) => [s.id, s.name]));
}

/** Mensagem de conflito pronta para a tela (o texto muda se a homônima está inativa). */
export function describeNameConflict(conflict: SellerLike): string {
  return conflict.active
    ? `Já existe uma vendedora ativa chamada ${conflict.name}.`
    : `Já existe ${conflict.name} (inativa). Se é a mesma pessoa, use REATIVAR em vez de criar outra.`;
}
