// Relatório da importação (dry-run) — PURO.
import type { ImportPlan, PlannedRow, SellerRef } from "./plan.ts";
import { normalizeForCompare } from "../text.ts";

export interface ExistingRecordKey {
  sale_date: string;
  tracking_code: string | null;
  customer_name_search: string;
  invoice_total: number | null;
}

export function fingerprintOfExisting(key: ExistingRecordKey): string {
  return [key.sale_date, key.tracking_code ?? "", key.customer_name_search, key.invoice_total === null ? "" : Number(key.invoice_total).toFixed(2)].join("|");
}

export interface ReportExtras {
  sellers: readonly SellerRef[];
  /** import_ref que já existem no banco (lote já importado) — consulta SOMENTE leitura. */
  existingRefs?: ReadonlySet<string>;
  /** fingerprints de registros que já existem no banco (mesmo rastreio+data+cliente+valor). */
  existingFingerprints?: ReadonlySet<string>;
}

export interface ImportReport {
  batchId: string;
  delimiter: string;
  /** Linhas com conteúdo (linhas totalmente vazias não contam). */
  totalRows: number;
  blankRowsSkipped: number;
  valid: number;
  rejected: number;
  /** Válidas cujo import_ref já existe no banco: seriam ignoradas na reimportação. */
  alreadyImported: number;
  /** Válidas que seriam realmente inseridas agora. */
  wouldInsert: number;
  possibleDuplicates: {
    /** Linhas idênticas dentro do mesmo arquivo: AVISO apenas — continuam registros distintos. */
    withinFile: { rows: number[] }[];
    withinFileRows: number;
    /** Já existe no banco registro com mesmo rastreio+data+cliente+valor (só detecta quando a linha tem rastreio). */
    inDatabaseRows: number[];
  };
  sellers: {
    recognized: { name: string; active: boolean; rows: number }[];
    unrecognized: { name: string; rows: number }[];
    ambiguous: { name: string; rows: number }[];
  };
  counts: {
    online: number;
    x: number;
    sellerBlank: number;
    delivered: number;
    resent: number;
    refunded: number;
    unknown: number;
    unrecognizedDelivery: number;
  };
  rejections: { row: number; reasons: string[] }[];
  rejectionReasonSummary: { reason: string; rows: number }[];
}

function reasonKind(reason: string): string {
  return reason.replace(/:.*$/, "").trim();
}

export function buildReport(plan: ImportPlan, extras: ReportExtras): ImportReport {
  const content = plan.rows.filter((r) => r.status !== "skipped_blank");
  const valid = content.filter((r) => r.status === "valid");
  const rejected = content.filter((r) => r.status === "rejected");

  const existingRefs = extras.existingRefs ?? new Set<string>();
  const alreadyImported = valid.filter((r) => existingRefs.has(r.record!.import_ref));

  // duplicadas dentro do arquivo
  const byFingerprint = new Map<string, number[]>();
  for (const row of valid) {
    if (!row.fingerprint) continue;
    byFingerprint.set(row.fingerprint, [...(byFingerprint.get(row.fingerprint) ?? []), row.rowNumber]);
  }
  const withinFile = [...byFingerprint.values()].filter((rows) => rows.length > 1).map((rows) => ({ rows }));

  const existingFingerprints = extras.existingFingerprints ?? new Set<string>();
  const inDatabaseRows = valid
    .filter((r) => r.fingerprint && existingFingerprints.has(r.fingerprint) && !existingRefs.has(r.record!.import_ref))
    .map((r) => r.rowNumber);

  // vendedoras
  const nameById = new Map(extras.sellers.map((s) => [s.id, s]));
  const recognizedCount = new Map<string, number>();
  const unrecognizedCount = new Map<string, { name: string; rows: number }>();
  const ambiguousCount = new Map<string, { name: string; rows: number }>();
  for (const row of content) {
    if (row.sellerKind === "known") {
      const id = row.record?.seller_id ?? matchSellerId(row, extras.sellers);
      if (id) recognizedCount.set(id, (recognizedCount.get(id) ?? 0) + 1);
    } else if (row.sellerKind === "unrecognized" || row.sellerKind === "ambiguous") {
      const map = row.sellerKind === "unrecognized" ? unrecognizedCount : ambiguousCount;
      const key = normalizeForCompare(row.sellerCell);
      const entry = map.get(key) ?? { name: row.sellerCell.trim(), rows: 0 };
      entry.rows += 1;
      map.set(key, entry);
    }
  }

  const countKind = (pick: (r: PlannedRow) => boolean) => content.filter(pick).length;

  const reasonSummary = new Map<string, number>();
  for (const row of rejected) {
    for (const kind of new Set(row.reasons.map(reasonKind))) reasonSummary.set(kind, (reasonSummary.get(kind) ?? 0) + 1);
  }

  return {
    batchId: plan.batchId,
    delimiter: plan.delimiter === "\t" ? "TAB" : plan.delimiter,
    totalRows: content.length,
    blankRowsSkipped: plan.rows.length - content.length,
    valid: valid.length,
    rejected: rejected.length,
    alreadyImported: alreadyImported.length,
    wouldInsert: valid.length - alreadyImported.length,
    possibleDuplicates: {
      withinFile,
      withinFileRows: withinFile.reduce((sum, g) => sum + g.rows.length, 0),
      inDatabaseRows,
    },
    sellers: {
      recognized: [...recognizedCount].map(([id, rows]) => ({
        name: nameById.get(id)?.name ?? id,
        active: nameById.get(id)?.active ?? false,
        rows,
      })),
      unrecognized: [...unrecognizedCount.values()].sort((a, b) => b.rows - a.rows),
      ambiguous: [...ambiguousCount.values()].sort((a, b) => b.rows - a.rows),
    },
    counts: {
      online: countKind((r) => r.sellerKind === "online"),
      x: countKind((r) => r.sellerKind === "x"),
      sellerBlank: countKind((r) => r.sellerKind === "blank"),
      delivered: countKind((r) => r.deliveryKind === "delivered"),
      resent: countKind((r) => r.deliveryKind === "resent"),
      refunded: countKind((r) => r.deliveryKind === "refunded"),
      unknown: countKind((r) => r.deliveryKind === "unknown"),
      unrecognizedDelivery: countKind((r) => r.deliveryKind === "unrecognized"),
    },
    rejections: rejected.map((r) => ({ row: r.rowNumber, reasons: r.reasons })),
    rejectionReasonSummary: [...reasonSummary].map(([reason, rows]) => ({ reason, rows })).sort((a, b) => b.rows - a.rows),
  };
}

function matchSellerId(row: PlannedRow, sellers: readonly SellerRef[]): string | null {
  const normalized = normalizeForCompare(row.sellerCell);
  return sellers.find((s) => normalizeForCompare(s.name) === normalized)?.id ?? null;
}

/** Texto legível do relatório. Mostra números de linha e a célula problemática — nunca o cadastro completo do cliente. */
export function formatReport(report: ImportReport, mode: "DRY-RUN" | "APLICAÇÃO" = "DRY-RUN"): string {
  const lines: string[] = [];
  const add = (text = "") => lines.push(text);

  add(`══ IMPORTAÇÃO HISTÓRICA — ${mode}${mode === "DRY-RUN" ? " (nada foi gravado)" : ""} ══`);
  add(`Lote: ${report.batchId}   |   separador do CSV: ${report.delimiter}`);
  add();
  add(`Total de linhas ............ ${report.totalRows}   (+ ${report.blankRowsSkipped} em branco ignoradas)`);
  add(`Válidas .................... ${report.valid}`);
  add(`Rejeitadas (revisar) ....... ${report.rejected}`);
  add(`  já importadas (mesmo lote) ${report.alreadyImported}`);
  add(`  seriam inseridas agora .... ${report.wouldInsert}`);
  add();
  add("Possíveis duplicadas");
  add(`  idênticas no arquivo ..... ${report.possibleDuplicates.withinFileRows} linhas em ${report.possibleDuplicates.withinFile.length} grupo(s) — AVISO: continuam registros distintos`);
  for (const group of report.possibleDuplicates.withinFile.slice(0, 10)) add(`    linhas ${group.rows.join(", ")}`);
  add(`  já existentes no banco ... ${report.possibleDuplicates.inDatabaseRows.length} linha(s)${report.possibleDuplicates.inDatabaseRows.length ? ": " + report.possibleDuplicates.inDatabaseRows.slice(0, 20).join(", ") : ""}`);
  add();
  add("Vendedoras");
  add(`  reconhecidas ............. ${report.sellers.recognized.length}`);
  for (const s of report.sellers.recognized) add(`    ${s.name}${s.active ? "" : " (inativa)"} — ${s.rows} linha(s)`);
  add(`  NÃO reconhecidas ......... ${report.sellers.unrecognized.length}  (nenhuma vendedora é criada automaticamente)`);
  for (const s of report.sellers.unrecognized) add(`    "${s.name}" — ${s.rows} linha(s)`);
  if (report.sellers.ambiguous.length) {
    add(`  ambíguas ................. ${report.sellers.ambiguous.length}`);
    for (const s of report.sellers.ambiguous) add(`    "${s.name}" — ${s.rows} linha(s)`);
  }
  add();
  add("(As contagens abaixo consideram todas as linhas com conteúdo, inclusive as rejeitadas.)");
  add("Origem / vendedora");
  add(`  ONLINE ................... ${report.counts.online}   (sales_origin = ONLINE)`);
  add(`  X ........................ ${report.counts.x}   (vendedora não informada: seller e origem NULL; "X" nunca é gravado)`);
  add(`  célula vazia ............. ${report.counts.sellerBlank}   (idem: seller e origem NULL)`);
  add();
  add("Situação da entrega");
  add(`  entregues ................ ${report.counts.delivered}   (DELIVERED + delivered_at)`);
  add(`  reenviadas ............... ${report.counts.resent}   (RESENT)`);
  add(`  estornadas ............... ${report.counts.refunded}   (REFUNDED)`);
  add(`  situação desconhecida .... ${report.counts.unknown}   (UNKNOWN — "Situação não informada", nunca PENDING)`);
  if (report.counts.unrecognizedDelivery) add(`  texto não reconhecido .... ${report.counts.unrecognizedDelivery}   (rejeitadas para revisão)`);
  add();
  if (report.rejected > 0) {
    add("Motivos de rejeição");
    for (const s of report.rejectionReasonSummary) add(`  ${String(s.rows).padStart(4)} × ${s.reason}`);
    add();
    add(`Linhas para revisar (${report.rejections.length}):`);
    for (const r of report.rejections.slice(0, 50)) add(`  linha ${r.row}: ${r.reasons.join("; ")}`);
    if (report.rejections.length > 50) add(`  … e mais ${report.rejections.length - 50} (veja o relatório JSON completo)`);
  }
  return lines.join("\n");
}
