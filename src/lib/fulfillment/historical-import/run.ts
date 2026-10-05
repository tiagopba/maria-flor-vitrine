// Orquestração da importação histórica — dry-run e aplicação SEPARADOS por tipo.
//
// `dryRun` só recebe um ReadOnlyImportDb (apenas métodos de LEITURA): por
// construção não consegue gravar. `applyImport` é a única função que recebe um
// WriteImportDb, e exige --confirm com o id do lote impresso pelo dry-run.
import { computeBatchId } from "./batch.ts";
import { planImport, type ImportPlan, type ImportRecord, type SellerRef } from "./plan.ts";
import {
  buildReport,
  fingerprintOfExisting,
  type ExistingRecordKey,
  type ImportReport,
} from "./report.ts";

export interface ReadOnlyImportDb {
  /** Quais destes import_ref já existem (lote já importado). */
  findExistingImportRefs(refs: string[]): Promise<Set<string>>;
  /** Registros que já existem com algum destes rastreios (para avisar de possível duplicada). */
  findRecordsByTrackingCodes(codes: string[]): Promise<ExistingRecordKey[]>;
}

export interface WriteImportDb {
  /** INSERT idempotente por import_ref (ON CONFLICT DO NOTHING). Devolve só o que foi realmente inserido. */
  insertRecords(records: ImportRecord[]): Promise<{ id: string; import_ref: string }[]>;
  insertAudit(entries: { record_id: string; actor_id: string; details: { source: "historical_import"; batch: string } }[]): Promise<void>;
}

export interface DryRunInput {
  csvText: string;
  /** Conteúdo bruto do arquivo (para a identidade do lote). */
  rawFile: string | Uint8Array;
  label?: string;
  sellers: readonly SellerRef[];
  readDb?: ReadOnlyImportDb;
}

export type DryRunResult = { ok: true; plan: ImportPlan; report: ImportReport } | { ok: false; error: string };

const CHUNK_SIZE = 200;
const CHUNK_PARAM_LIMIT = 100;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Planeja e gera o relatório. NÃO grava nada (nem consegue: só tem acesso de leitura). */
export async function dryRun(input: DryRunInput): Promise<DryRunResult> {
  const batchId = computeBatchId(input.rawFile, input.label);
  const planned = planImport(input.csvText, { batchId, sellers: input.sellers });
  if (!planned.ok) return planned;

  const valid = planned.plan.rows.filter((r) => r.status === "valid");
  const existingRefs = new Set<string>();
  const existingFingerprints = new Set<string>();

  if (input.readDb && valid.length > 0) {
    for (const refs of chunk(
      valid.map((r) => r.record!.import_ref),
      CHUNK_PARAM_LIMIT
    )) {
      for (const ref of await input.readDb.findExistingImportRefs(refs)) existingRefs.add(ref);
    }
    const trackingCodes = [...new Set(valid.map((r) => r.record!.tracking_code).filter((c): c is string => Boolean(c)))];
    for (const codes of chunk(trackingCodes, CHUNK_PARAM_LIMIT)) {
      for (const key of await input.readDb.findRecordsByTrackingCodes(codes)) existingFingerprints.add(fingerprintOfExisting(key));
    }
  }

  const report = buildReport(planned.plan, { sellers: input.sellers, existingRefs, existingFingerprints });
  return { ok: true, plan: planned.plan, report };
}

export interface ApplyInput {
  plan: ImportPlan;
  report: ImportReport;
  /** Precisa ser IGUAL ao id do lote impresso pelo dry-run. */
  confirm: string | undefined;
  actorId: string | undefined;
  writeDb: WriteImportDb;
  existingRefs: ReadonlySet<string>;
}

export type ApplyResult = { ok: true; inserted: number; skippedAlreadyImported: number; rejectedNotImported: number } | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ÚNICO ponto que grava. Só roda com --apply e --confirm <lote> e um --actor válido. */
export async function applyImport(input: ApplyInput): Promise<ApplyResult> {
  if (input.confirm !== input.plan.batchId) {
    return { ok: false, error: `Confirmação ausente ou diferente do lote. Rode o dry-run e passe --confirm ${input.plan.batchId}` };
  }
  if (!input.actorId || !UUID.test(input.actorId)) {
    return { ok: false, error: "--actor <uuid do perfil Admin que está importando> é obrigatório." };
  }

  const toInsert = input.plan.rows
    .filter((r) => r.status === "valid" && !input.existingRefs.has(r.record!.import_ref))
    .map((r) => r.record!);

  let inserted = 0;
  for (const part of chunk(toInsert, CHUNK_SIZE)) {
    const rows = await input.writeDb.insertRecords(part);
    inserted += rows.length;
    if (rows.length > 0) {
      await input.writeDb.insertAudit(
        rows.map((row) => ({
          record_id: row.id,
          actor_id: input.actorId!,
          details: { source: "historical_import" as const, batch: input.plan.batchId },
        }))
      );
    }
  }

  return {
    ok: true,
    inserted,
    skippedAlreadyImported: input.report.alreadyImported,
    rejectedNotImported: input.report.rejected,
  };
}
