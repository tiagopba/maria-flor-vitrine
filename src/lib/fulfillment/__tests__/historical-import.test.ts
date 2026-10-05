import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { computeBatchId } from "../historical-import/batch.ts";
import { parseCsv } from "../historical-import/csv.ts";
import { importRefFor, parseSheetDate, parseSheetMoney, planImport, type ImportRecord, type SellerRef } from "../historical-import/plan.ts";
import { formatReport } from "../historical-import/report.ts";
import { applyImport, dryRun, type ReadOnlyImportDb, type WriteImportDb } from "../historical-import/run.ts";

const ROOT = process.cwd();
const FIXTURE = readFileSync(join(ROOT, "src/lib/fulfillment/__tests__/fixtures/historico-ficticio.csv"), "utf8");

const SELLERS: SellerRef[] = [
  { id: "11111111-1111-4111-8111-111111111111", name: "Camila", active: true },
  { id: "22222222-2222-4222-8222-222222222222", name: "Bruniani", active: true },
  { id: "33333333-3333-4333-8333-333333333333", name: "Lidiane", active: true },
  { id: "44444444-4444-4444-8444-444444444444", name: "Maria Abadia", active: false },
];
const ACTOR = "99999999-9999-4999-8999-999999999999";

async function plan(csv = FIXTURE) {
  const result = await dryRun({ csvText: csv, rawFile: csv, label: "teste", sellers: SELLERS });
  assert.ok(result.ok, "dry-run deveria funcionar");
  return result;
}
const rowOf = (p: Awaited<ReturnType<typeof plan>>, n: number) => p.plan.rows.find((r) => r.rowNumber === n)!;

describe("CSV", () => {
  it("lê BOM, separador ';', aspas com \"\" e o separador dentro de aspas", () => {
    const parsed = parseCsv(FIXTURE);
    assert.equal(parsed.delimiter, ";");
    assert.equal(parsed.header[0], "Data da venda");
    assert.equal(parsed.rows.length, 17);
    assert.equal(parsed.rows[12][2], 'Cliente "Aspas"; Teste');
  });

  it("separador ',' e quebra de linha dentro de aspas", () => {
    const parsed = parseCsv('a,b\n1,"linha1\nlinha2"\n');
    assert.equal(parsed.delimiter, ",");
    assert.deepEqual(parsed.rows, [["1", "linha1\nlinha2"]]);
  });
});

describe("regras de linha (sem adivinhar)", () => {
  it("X → vendedora e origem NULL; 'X' nunca é gravado como nome nem origem", async () => {
    const r = rowOf(await plan(), 4);
    assert.equal(r.status, "valid");
    assert.equal(r.record!.seller_id, null);
    assert.equal(r.record!.sales_origin, null);
    const all = (await plan()).plan.rows.flatMap((x) => (x.record ? [x.record] : []));
    assert.ok(all.every((rec) => rec.sales_origin !== "X" && rec.customer_name !== "X"));
  });

  it("ONLINE → sales_origin ONLINE e seller NULL", async () => {
    const r = rowOf(await plan(), 3);
    assert.equal(r.record!.sales_origin, "ONLINE");
    assert.equal(r.record!.seller_id, null);
  });

  it("nome casa por nome normalizado (caixa/acento) e usa o id existente", async () => {
    const r = rowOf(await plan(), 2); // "bruniani" minúsculo
    assert.equal(r.record!.seller_id, SELLERS[1].id);
  });

  it("vendedora desconhecida NUNCA é criada: a linha vai para revisão", async () => {
    const r = rowOf(await plan(), 5);
    assert.equal(r.status, "rejected");
    assert.match(r.reasons.join(), /vendedora não reconhecida/);
    assert.equal((await plan()).report.sellers.unrecognized[0].name, "Fulana Desconhecida");
  });

  it("data em Entrega → DELIVERED + delivered_at; REENVIADO → RESENT; ESTORNADO → REFUNDED", async () => {
    const p = await plan();
    assert.deepEqual([rowOf(p, 1).record!.delivery_status, rowOf(p, 1).record!.delivered_at], ["DELIVERED", "2025-03-15"]);
    assert.equal(rowOf(p, 2).record!.delivery_status, "RESENT");
    assert.equal(rowOf(p, 3).record!.delivery_status, "REFUNDED");
    assert.equal(rowOf(p, 3).record!.delivered_at, null);
  });

  it("célula de entrega vazia → UNKNOWN (nunca PENDING)", async () => {
    const p = await plan();
    assert.equal(rowOf(p, 4).record!.delivery_status, "UNKNOWN");
    const statuses = p.plan.rows.flatMap((x) => (x.record ? [x.record.delivery_status] : []));
    assert.ok(!statuses.includes("PENDING"));
    assert.ok(!statuses.includes("DELIVERY_ISSUE") && !statuses.includes("IN_TRANSIT"));
  });

  it("sem data da venda, sem cliente e UF inválida são rejeitadas (UF nunca corrigida por adivinhação)", async () => {
    const p = await plan();
    assert.match(rowOf(p, 6).reasons.join(), /sem data da venda/);
    assert.match(rowOf(p, 7).reasons.join(), /sem cliente/);
    assert.match(rowOf(p, 10).reasons.join(), /UF inválida/);
    assert.equal(rowOf(p, 10).record, undefined);
  });

  it("texto de entrega não reconhecido, ano de 2 dígitos e valor inválido vão para revisão", async () => {
    const p = await plan();
    assert.match(rowOf(p, 11).reasons.join(), /situação\/entrega não reconhecida/);
    assert.match(rowOf(p, 12).reasons.join(), /data da venda inválida/);
    assert.match(rowOf(p, 16).reasons.join(), /valor inválido/);
  });

  it("registro histórico nunca tem caminho de PDF; rastreio é normalizado", async () => {
    const p = await plan();
    const rec = rowOf(p, 13).record!;
    assert.equal(rec.danfe_file_path, null);
    assert.equal(rec.label_file_path, null);
    assert.equal(rec.record_source, "HISTORICAL_IMPORT");
    assert.equal(rec.tracking_code, "QR888888888BR");
    assert.equal(rec.customer_name, 'Cliente "Aspas"; Teste');
  });

  it("datas e valores", () => {
    assert.equal(parseSheetDate("5/3/2025"), "2025-03-05");
    assert.equal(parseSheetDate("31/02/2025"), null);
    assert.equal(parseSheetDate("14/03/25"), null);
    assert.equal(parseSheetMoney("R$ 1.139,99"), 1139.99);
    assert.equal(parseSheetMoney(""), null);
    assert.ok(Number.isNaN(parseSheetMoney("abc")));
  });

  it("cabeçalho sem as colunas obrigatórias é erro claro, sem importar nada", () => {
    const result = planImport("Foo;Bar\n1;2\n", { batchId: "x", sellers: SELLERS });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.error, /obrigatórias/);
  });
});

describe("relatório do dry-run", () => {
  it("traz todos os números pedidos", async () => {
    const { report } = await plan();
    assert.equal(report.totalRows, 16);
    assert.equal(report.valid, 9);
    assert.equal(report.rejected, 7);
    assert.equal(report.valid + report.rejected, report.totalRows);
    assert.equal(report.counts.online, 2);
    assert.equal(report.counts.x, 1);
    assert.equal(report.counts.delivered, 5);
    assert.equal(report.counts.resent, 1);
    assert.equal(report.counts.refunded, 1);
    assert.ok(report.counts.unknown >= 1);
    assert.equal(report.sellers.recognized.length, 4);
    assert.equal(report.sellers.unrecognized.length, 1);
    const text = formatReport(report);
    for (const needle of ["Total de linhas", "Válidas", "Rejeitadas", "Possíveis duplicadas", "reconhecidas", "NÃO reconhecidas", "ONLINE", "X ...", "entregues", "reenviadas", "estornadas", "situação desconhecida", "nada foi gravado"]) {
      assert.ok(text.includes(needle), needle);
    }
  });

  it("linhas idênticas no arquivo são só um AVISO e continuam registros distintos", async () => {
    const p = await plan();
    assert.deepEqual(p.report.possibleDuplicates.withinFile, [{ rows: [8, 9] }]);
    assert.equal(rowOf(p, 8).status, "valid");
    assert.equal(rowOf(p, 9).status, "valid");
  });
});

describe("idempotência: lote e import_ref", () => {
  it("mesmo arquivo → mesmo lote e mesmas referências; arquivo diferente → outro lote", async () => {
    const a = await plan();
    const b = await plan();
    assert.equal(a.plan.batchId, b.plan.batchId);
    assert.deepEqual(
      a.plan.rows.flatMap((r) => (r.record ? [r.record.import_ref] : [])),
      b.plan.rows.flatMap((r) => (r.record ? [r.record.import_ref] : []))
    );
    assert.notEqual(computeBatchId(FIXTURE, "x"), computeBatchId(FIXTURE + " ", "x"));
  });

  it("duas linhas IDÊNTICAS em posições diferentes têm import_ref DIFERENTES", async () => {
    const p = await plan();
    assert.notEqual(rowOf(p, 8).record!.import_ref, rowOf(p, 9).record!.import_ref);
    assert.equal(rowOf(p, 8).record!.import_ref, importRefFor(p.plan.batchId, 8));
    const refs = p.plan.rows.flatMap((r) => (r.record ? [r.record.import_ref] : []));
    assert.equal(new Set(refs).size, refs.length);
  });

  it("reaplicar o mesmo lote não duplica (o banco-simulado aplica o índice único por import_ref)", async () => {
    const stored = new Map<string, ImportRecord>();
    const writeDb: WriteImportDb = {
      async insertRecords(records) {
        const out: { id: string; import_ref: string }[] = [];
        for (const r of records) {
          if (stored.has(r.import_ref)) throw new Error("23505 import_ref duplicado");
          stored.set(r.import_ref, r);
          out.push({ id: `id-${stored.size}`, import_ref: r.import_ref });
        }
        return out;
      },
      async insertAudit() {},
    };
    const first = await plan();
    const r1 = await applyImport({ plan: first.plan, report: first.report, confirm: first.plan.batchId, actorId: ACTOR, writeDb, existingRefs: new Set() });
    assert.ok(r1.ok && r1.inserted === 9);
    // segunda execução: o dry-run enxerga os import_ref já gravados e o apply os ignora
    const readDb: ReadOnlyImportDb = {
      async findExistingImportRefs(refs) { return new Set(refs.filter((x) => stored.has(x))); },
      async findRecordsByTrackingCodes() { return []; },
    };
    const second = await dryRun({ csvText: FIXTURE, rawFile: FIXTURE, label: "teste", sellers: SELLERS, readDb });
    assert.ok(second.ok);
    if (!second.ok) return;
    assert.equal(second.report.alreadyImported, 9);
    assert.equal(second.report.wouldInsert, 0);
    const existingRefs = await readDb.findExistingImportRefs(second.plan.rows.flatMap((r) => (r.record ? [r.record.import_ref] : [])));
    const r2 = await applyImport({ plan: second.plan, report: second.report, confirm: second.plan.batchId, actorId: ACTOR, writeDb, existingRefs });
    assert.ok(r2.ok && r2.inserted === 0);
    assert.equal(stored.size, 9);
  });
});

describe("dry-run não grava ABSOLUTAMENTE nada", () => {
  it("só consegue chamar métodos de leitura (qualquer outro acesso explode)", async () => {
    const calls: string[] = [];
    const readOnly: ReadOnlyImportDb = {
      async findExistingImportRefs(refs) { calls.push("findExistingImportRefs"); void refs; return new Set(); },
      async findRecordsByTrackingCodes(codes) { calls.push("findRecordsByTrackingCodes"); void codes; return []; },
    };
    // Proxy: qualquer método que NÃO seja de leitura lança.
    const guarded = new Proxy(readOnly, {
      get(target, prop: string) {
        if (prop === "findExistingImportRefs" || prop === "findRecordsByTrackingCodes") return target[prop as keyof ReadOnlyImportDb];
        throw new Error(`dry-run tentou usar ${String(prop)}`);
      },
    });
    const result = await dryRun({ csvText: FIXTURE, rawFile: FIXTURE, sellers: SELLERS, readDb: guarded });
    assert.ok(result.ok);
    assert.ok(calls.every((c) => c.startsWith("find")));
  });

  it("o código do dry-run não referencia nenhuma escrita", () => {
    const run = readFileSync(join(ROOT, "src/lib/fulfillment/historical-import/run.ts"), "utf8");
    const dryRunSource = run.slice(run.indexOf("export async function dryRun"), run.indexOf("export interface ApplyInput"));
    assert.doesNotMatch(dryRunSource, /insertRecords|insertAudit|\.insert\(|\.update\(|\.delete\(|\.upsert\(/);
    // E o CLI só instancia o cliente de escrita dentro do ramo --apply.
    const cli = readFileSync(join(ROOT, "scripts/import-fulfillment-history.mts"), "utf8");
    assert.match(cli, /if \(args\.apply\) \{\s*writeDb = \{/);
  });
});

describe("aplicar exige confirmação explícita", () => {
  it("sem --confirm do lote ou sem --actor, nada é gravado", async () => {
    let writes = 0;
    const writeDb: WriteImportDb = {
      async insertRecords() { writes += 1; return []; },
      async insertAudit() { writes += 1; },
    };
    const p = await plan();
    const base = { plan: p.plan, report: p.report, writeDb, existingRefs: new Set<string>() };
    assert.equal((await applyImport({ ...base, confirm: undefined, actorId: ACTOR })).ok, false);
    assert.equal((await applyImport({ ...base, confirm: "outro-lote", actorId: ACTOR })).ok, false);
    assert.equal((await applyImport({ ...base, confirm: p.plan.batchId, actorId: undefined })).ok, false);
    assert.equal((await applyImport({ ...base, confirm: p.plan.batchId, actorId: "nao-uuid" })).ok, false);
    assert.equal(writes, 0);
  });

  it("linhas rejeitadas nunca são inseridas", async () => {
    const inserted: ImportRecord[] = [];
    const writeDb: WriteImportDb = {
      async insertRecords(records) { inserted.push(...records); return records.map((r, i) => ({ id: String(i), import_ref: r.import_ref })); },
      async insertAudit() {},
    };
    const p = await plan();
    await applyImport({ plan: p.plan, report: p.report, confirm: p.plan.batchId, actorId: ACTOR, writeDb, existingRefs: new Set() });
    assert.equal(inserted.length, 9);
    assert.ok(inserted.every((r) => r.record_source === "HISTORICAL_IMPORT" && r.danfe_file_path === null));
  });
});

describe("volume", () => {
  it("2500 linhas: planeja tudo sem truncar", async () => {
    const lines = ["Data da venda;Cliente;Vendedora;Entrega"];
    for (let i = 0; i < 2500; i += 1) lines.push(`01/03/2025;Cliente ${i};Camila;`);
    const result = await dryRun({ csvText: lines.join("\n"), rawFile: "grande", sellers: SELLERS });
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.report.valid, 2500);
      assert.equal(new Set(result.plan.rows.map((r) => r.record!.import_ref)).size, 2500);
    }
  });
});
