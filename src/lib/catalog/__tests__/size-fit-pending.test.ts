import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SIZE_FIT_ID_CHUNK_SIZE,
  chunk,
  fetchAllPages,
  findPendingProductIds,
  groupSizeFits,
  isSizeFitPending,
  loadSizeFitRows,
  type FitRow,
  type SizeRow,
} from "../size-fit-pending.ts";

// ── Simulação do servidor: devolve no máximo 1000 linhas por request, sem erro ──────────
const SERVER_CAP = 1000;

interface Catalog {
  activeIds: string[];
  archivedIds: string[];
  sizes: SizeRow[];
  fits: FitRow[];
}

/** Catálogo com os números REAIS: 276 ativos + 230 arquivados, 707 tamanhos, 1539 compatibilidades. */
function buildRealisticCatalog(): Catalog {
  const activeIds = Array.from({ length: 276 }, (_, i) => `A${String(i).padStart(3, "0")}`);
  const archivedIds = Array.from({ length: 230 }, (_, i) => `X${String(i).padStart(3, "0")}`);
  const sizes: SizeRow[] = [];
  const fits: FitRow[] = [];

  function addProduct(id: string, labelCount: number, state: { labelsSeen: number; withThree: number }, threeBudget: number) {
    for (let l = 0; l < labelCount; l += 1) {
      const size = ["P", "M", "G"][l];
      sizes.push({ product_id: id, size });
      const fitCount = state.labelsSeen < threeBudget ? 3 : 2;
      state.labelsSeen += 1;
      for (let f = 0; f < fitCount; f += 1) fits.push({ product_id: id, label_size: size, fit_size: 34 + f * 2 });
    }
  }

  // Ordem física: arquivados primeiro, depois ativos — as linhas dos ativos que ficam
  // depois da posição 1000 são as que um GET único perde.
  const archivedState = { labelsSeen: 0, withThree: 0 };
  archivedIds.forEach((id, i) => addProduct(id, i < 57 ? 2 : 1, archivedState, 51));
  const activeState = { labelsSeen: 0, withThree: 0 };
  activeIds.forEach((id, i) => addProduct(id, i < 144 ? 2 : 1, activeState, 74));

  return { activeIds, archivedIds, sizes, fits };
}

interface Request {
  table: "sizes" | "fits";
  ids: string[];
  from: number;
  to: number;
}

function makeServer(catalog: Catalog, shuffleSeed?: number) {
  let sizes = [...catalog.sizes];
  let fits = [...catalog.fits];
  if (shuffleSeed !== undefined) {
    sizes = shuffle(sizes, shuffleSeed);
    fits = shuffle(fits, shuffleSeed + 1);
  }
  const requests: Request[] = [];
  const page = <T extends { product_id: string }>(table: Request["table"], rows: T[]) =>
    async (ids: string[], from: number, to: number): Promise<T[]> => {
      requests.push({ table, ids, from, to });
      const filtered = rows.filter((r) => ids.includes(r.product_id));
      return filtered.slice(from, Math.min(to + 1, from + SERVER_CAP));
    };
  return { requests, fetchSizesPage: page("sizes", sizes), fetchFitsPage: page("fits", fits) };
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(items: T[], seed: number): T[] {
  const rand = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** O algoritmo ANTIGO: 3 leituras únicas, sem filtro e sem paginação (cada uma truncada a 1000). */
function legacyBadgeCount(catalog: Catalog): number {
  const all = { sizes: catalog.sizes.slice(0, SERVER_CAP), fits: catalog.fits.slice(0, SERVER_CAP) };
  const active = new Set(catalog.activeIds);
  const keys = new Set(all.fits.map((f) => `${f.product_id}::${f.label_size}`));
  const pending = new Set<string>();
  for (const row of all.sizes) {
    if (!active.has(row.product_id) || pending.has(row.product_id)) continue;
    if (!keys.has(`${row.product_id}::${row.size}`)) pending.add(row.product_id);
  }
  return pending.size;
}

async function badgeCount(catalog: Catalog, shuffleSeed?: number) {
  const server = makeServer(catalog, shuffleSeed);
  const { sizes, fits } = await loadSizeFitRows(catalog.activeIds, server.fetchSizesPage, server.fetchFitsPage);
  return { pending: findPendingProductIds(catalog.activeIds, sizes, fits), sizes, fits, requests: server.requests };
}

async function pageCount(catalog: Catalog, shuffleSeed?: number) {
  const server = makeServer(catalog, shuffleSeed);
  const { sizes, fits } = await loadSizeFitRows(catalog.activeIds, server.fetchSizesPage, server.fetchFitsPage);
  const grouped = groupSizeFits(sizes, fits);
  return new Set([...grouped].filter(([, labels]) => isSizeFitPending(labels)).map(([id]) => id));
}

describe("catálogo de teste tem os números reais", () => {
  it("276 ativos, 230 arquivados, 707 tamanhos e 1539 compatibilidades", () => {
    const c = buildRealisticCatalog();
    assert.equal(c.activeIds.length, 276);
    assert.equal(c.archivedIds.length, 230);
    assert.equal(c.sizes.length, 707);
    assert.equal(c.fits.length, 1539);
    const activeFits = c.fits.filter((f) => f.product_id.startsWith("A"));
    assert.equal(activeFits.length, 914);
  });
});

describe("o bug original (leitura única truncada em 1000 linhas)", () => {
  it("reproduz: produtos COMPLETOS aparecem como pendentes", () => {
    const c = buildRealisticCatalog();
    assert.ok(legacyBadgeCount(c) > 0, "o algoritmo antigo devia gerar falsos pendentes");
  });
});

describe("com paginação: 1539 compatibilidades completas", () => {
  it("badge = 0, página = 0 e nenhum falso pendente", async () => {
    const c = buildRealisticCatalog();
    const badge = await badgeCount(c);
    const page = await pageCount(c);
    assert.equal(badge.pending.size, 0);
    assert.equal(page.size, 0);
    assert.deepEqual([...badge.pending], [...page]);
  });

  it("lê tudo da população ativa: 420 tamanhos e 914 compatibilidades (nunca trunca)", async () => {
    const badge = await badgeCount(buildRealisticCatalog());
    assert.equal(badge.sizes.length, 420);
    assert.equal(badge.fits.length, 914);
  });

  it("produtos ARCHIVED nunca são pedidos nem lidos", async () => {
    const c = buildRealisticCatalog();
    const badge = await badgeCount(c);
    const archived = new Set(c.archivedIds);
    assert.ok(badge.requests.every((r) => r.ids.every((id) => !archived.has(id))));
    assert.ok(badge.sizes.every((s) => !archived.has(s.product_id)));
    assert.ok(badge.fits.every((f) => !archived.has(f.product_id)));
  });

  it("os ids vão em lotes curtos no .in() (nunca uma URL gigante)", async () => {
    const badge = await badgeCount(buildRealisticCatalog());
    const max = Math.max(...badge.requests.map((r) => r.ids.length));
    assert.ok(max <= SIZE_FIT_ID_CHUNK_SIZE);
    assert.ok(badge.requests.length >= Math.ceil(276 / SIZE_FIT_ID_CHUNK_SIZE) * 2);
  });
});

describe("pendência real continua sendo contada", () => {
  it("produto sem UMA compatibilidade (de vários tamanhos) é pendente — badge e página concordam", async () => {
    const c = buildRealisticCatalog();
    // A000 tem 2 tamanhos (P e M): remove todas as compatibilidades de M.
    const broken = { ...c, fits: c.fits.filter((f) => !(f.product_id === "A000" && f.label_size === "M")) };
    const badge = await badgeCount(broken);
    const page = await pageCount(broken);
    assert.deepEqual([...badge.pending], ["A000"]);
    assert.deepEqual([...page], ["A000"]);
  });

  it("produto de um tamanho só, sem nenhuma compatibilidade, também é pendente", async () => {
    const c = buildRealisticCatalog();
    const broken = { ...c, fits: c.fits.filter((f) => f.product_id !== "A200") };
    assert.deepEqual([...(await badgeCount(broken)).pending], ["A200"]);
  });

  it("compatibilidade órfã (de um tamanho que não existe mais) não esconde a pendência", () => {
    const sizes: SizeRow[] = [{ product_id: "P1", size: "M" }];
    const fits: FitRow[] = [{ product_id: "P1", label_size: "G", fit_size: 40 }];
    assert.deepEqual([...findPendingProductIds(["P1"], sizes, fits)], ["P1"]);
  });

  it("ARCHIVED sem compatibilidade NÃO entra na população do badge", async () => {
    const c = buildRealisticCatalog();
    const broken = { ...c, fits: c.fits.filter((f) => f.product_id !== "X010") };
    assert.equal((await badgeCount(broken)).pending.size, 0);
    // Mesmo que as linhas do arquivado fossem entregues à regra, ele é ignorado.
    assert.equal(findPendingProductIds(c.activeIds, broken.sizes, broken.fits).size, 0);
  });
});

describe("mais de 1000 compatibilidades ATIVAS", () => {
  function bigActiveCatalog(): Catalog {
    const activeIds = Array.from({ length: 500 }, (_, i) => `B${String(i).padStart(3, "0")}`);
    const sizes: SizeRow[] = activeIds.map((id) => ({ product_id: id, size: "Único" }));
    const fits: FitRow[] = activeIds.flatMap((id) =>
      [36, 38, 40].map((fit_size) => ({ product_id: id, label_size: "Único", fit_size }))
    );
    return { activeIds, archivedIds: [], sizes, fits };
  }

  it("1500 linhas ativas completas → 0 pendentes (várias páginas por lote)", async () => {
    const c = bigActiveCatalog();
    assert.equal(c.fits.length, 1500);
    const badge = await badgeCount(c);
    assert.equal(badge.fits.length, 1500);
    assert.equal(badge.pending.size, 0);
    assert.equal((await pageCount(c)).size, 0);
  });

  it("um produto realmente incompleto continua pendente", async () => {
    const c = bigActiveCatalog();
    const broken = { ...c, fits: c.fits.filter((f) => f.product_id !== "B499") };
    assert.deepEqual([...(await badgeCount(broken)).pending], ["B499"]);
  });

  it("um único lote com mais de 1000 linhas exige páginas seguintes (from = 1000)", async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => ({ product_id: "Z", size: `s${i}` }));
    const server = makeServer({ activeIds: ["Z"], archivedIds: [], sizes: rows, fits: [] });
    const { sizes } = await loadSizeFitRows(["Z"], server.fetchSizesPage, server.fetchFitsPage);
    assert.equal(sizes.length, 2500);
    const froms = server.requests.filter((r) => r.table === "sizes").map((r) => r.from);
    assert.deepEqual(froms, [0, 1000, 2000]);
  });
});

describe("o resultado não depende da ordem das linhas", () => {
  it("catálogo completo: sempre 0, em 6 ordens diferentes", async () => {
    const c = buildRealisticCatalog();
    for (const seed of [1, 2, 3, 42, 1234, 99999]) {
      assert.equal((await badgeCount(c, seed)).pending.size, 0, `seed ${seed}`);
      assert.equal((await pageCount(c, seed)).size, 0, `seed ${seed}`);
    }
  });

  it("catálogo com 1 pendência real: sempre o mesmo produto, em 6 ordens diferentes", async () => {
    const c = buildRealisticCatalog();
    const broken = { ...c, fits: c.fits.filter((f) => !(f.product_id === "A050" && f.label_size === "P")) };
    for (const seed of [1, 2, 3, 42, 1234, 99999]) {
      assert.deepEqual([...(await badgeCount(broken, seed)).pending], ["A050"], `seed ${seed}`);
    }
    const reversed = { ...broken, sizes: [...broken.sizes].reverse(), fits: [...broken.fits].reverse() };
    assert.deepEqual([...(await badgeCount(reversed)).pending], ["A050"]);
  });
});

describe("fetchAllPages", () => {
  const makePager = (total: number) => {
    const calls: [number, number][] = [];
    const fetchPage = async (from: number, to: number) => {
      calls.push([from, to]);
      return Array.from({ length: Math.max(0, Math.min(to + 1, total) - from) }, (_, i) => from + i);
    };
    return { calls, fetchPage };
  };

  it("para quando recebe menos que o tamanho da página", async () => {
    const { calls, fetchPage } = makePager(2500);
    const rows = await fetchAllPages(fetchPage, 1000);
    assert.equal(rows.length, 2500);
    assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it("múltiplo exato do tamanho da página: pede uma página extra (vazia) e termina", async () => {
    const { calls, fetchPage } = makePager(2000);
    assert.equal((await fetchAllPages(fetchPage, 1000)).length, 2000);
    assert.equal(calls.length, 3);
  });

  it("tabela vazia: uma única chamada", async () => {
    const { calls, fetchPage } = makePager(0);
    assert.deepEqual(await fetchAllPages(fetchPage, 1000), []);
    assert.equal(calls.length, 1);
  });

  it("erro numa página lança — nunca devolve leitura parcial como se fosse completa", async () => {
    let n = 0;
    await assert.rejects(
      fetchAllPages(async () => {
        n += 1;
        if (n === 2) throw new Error("falha de rede");
        return Array.from({ length: 1000 }, (_, i) => i);
      }, 1000),
      /falha de rede/
    );
  });

  it("chunk divide sem perder nem repetir ids", () => {
    const ids = Array.from({ length: 276 }, (_, i) => `i${i}`);
    const parts = chunk(ids, 100);
    assert.deepEqual(parts.map((p) => p.length), [100, 100, 76]);
    assert.deepEqual(parts.flat(), ids);
  });
});
