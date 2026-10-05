// Importador do histórico de envios (planilha antiga → fulfillment_records).
//
//   node scripts/import-fulfillment-history.mts <arquivo.csv> [opções]
//
// PADRÃO = DRY-RUN: lê o CSV, gera o relatório e NÃO grava nada.
//   --label <apelido>                       apelido legível para o lote
//   --sellers "Camila,Bruniani"             (offline) vendedoras reconhecidas, sem acessar o banco
//   --db                                    lê vendedoras e registros existentes do banco (SOMENTE LEITURA)
//   --json <arquivo>                        salva o relatório completo em JSON
//   --apply --confirm <lote> --actor <uuid> GRAVA os registros válidos (exige --db). Só com aprovação.
//
// Regras: "X" → vendedora e origem NULL · ONLINE → origem ONLINE · nome → casa com `sellers`
// (nunca cria vendedora) · data em "Entrega" → DELIVERED · REENVIADO → RESENT · ESTORNADO →
// REFUNDED · vazio → UNKNOWN. Sem data da venda, sem cliente ou com UF inválida → rejeitada.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { formatReport } from "../src/lib/fulfillment/historical-import/report.ts";
import {
  applyImport,
  dryRun,
  type ReadOnlyImportDb,
  type WriteImportDb,
} from "../src/lib/fulfillment/historical-import/run.ts";
import type { SellerRef } from "../src/lib/fulfillment/historical-import/plan.ts";

function usage(message?: string): never {
  if (message) console.error(`Erro: ${message}\n`);
  console.error(
    [
      "Uso: node scripts/import-fulfillment-history.mts <arquivo.csv> [--label x] [--sellers \"A,B\" | --db] [--json out.json]",
      "     (padrão: DRY-RUN, não grava nada)",
      "     node scripts/import-fulfillment-history.mts <arquivo.csv> --db --apply --confirm <lote> --actor <uuid>",
    ].join("\n")
  );
  process.exit(message ? 1 : 0);
}

function parseArgs(argv: string[]) {
  const args = { file: "", label: undefined as string | undefined, sellers: undefined as string | undefined, db: false, json: undefined as string | undefined, apply: false, confirm: undefined as string | undefined, actor: undefined as string | undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--label") args.label = argv[++i];
    else if (a === "--sellers") args.sellers = argv[++i];
    else if (a === "--db") args.db = true;
    else if (a === "--json") args.json = argv[++i];
    else if (a === "--apply") args.apply = true;
    else if (a === "--confirm") args.confirm = argv[++i];
    else if (a === "--actor") args.actor = argv[++i];
    else if (a === "--help" || a === "-h") usage();
    else if (a.startsWith("--")) usage(`opção desconhecida: ${a}`);
    else if (!args.file) args.file = a;
    else usage(`argumento inesperado: ${a}`);
  }
  return args;
}

function loadEnv(): Record<string, string> {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {};
  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split(/\r?\n/)
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).replace(/^"|"$/g, "")])
  );
}

const args = parseArgs(process.argv.slice(2));
if (!args.file) usage("informe o arquivo CSV.");
if (args.apply && !args.db) usage("--apply exige --db.");
if (args.sellers && args.db) usage("use --sellers (offline) OU --db, não os dois.");
if (!args.sellers && !args.db) usage('informe --sellers "Nome1,Nome2" (offline) ou --db (leitura do banco).');

const raw = fs.readFileSync(args.file);
const csvText = raw.toString("utf8");

let sellers: SellerRef[] = [];
let readDb: ReadOnlyImportDb | undefined;
let writeDb: WriteImportDb | undefined;

if (args.db) {
  const env = loadEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) usage("--db precisa de NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.");
  const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: sellerRows, error: sellersError } = await supabase.from("sellers").select("id, name, active");
  if (sellersError) throw new Error(sellersError.message);
  sellers = sellerRows ?? [];

  // SOMENTE LEITURA (selects).
  readDb = {
    async findExistingImportRefs(refs) {
      const { data, error } = await supabase.from("fulfillment_records").select("import_ref").in("import_ref", refs);
      if (error) throw new Error(error.message);
      return new Set((data ?? []).map((r) => r.import_ref as string));
    },
    async findRecordsByTrackingCodes(codes) {
      const { data, error } = await supabase
        .from("fulfillment_records")
        .select("sale_date, tracking_code, customer_name_search, invoice_total")
        .in("tracking_code", codes);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  };

  if (args.apply) {
    writeDb = {
      async insertRecords(records) {
        const rows = records.map((r) => ({ ...r, created_by: args.actor }));
        const { data, error } = await supabase.from("fulfillment_records").insert(rows).select("id, import_ref");
        if (!error) return (data ?? []) as { id: string; import_ref: string }[];
        // 23505 = import_ref já existe (corrida/reexecução): reinsere só o que falta.
        if (error.code !== "23505") throw new Error(error.message);
        const { data: existing } = await supabase.from("fulfillment_records").select("import_ref").in("import_ref", records.map((r) => r.import_ref));
        const have = new Set((existing ?? []).map((e) => e.import_ref as string));
        const missing = rows.filter((r) => !have.has(r.import_ref));
        if (missing.length === 0) return [];
        const retry = await supabase.from("fulfillment_records").insert(missing).select("id, import_ref");
        if (retry.error) throw new Error(retry.error.message);
        return (retry.data ?? []) as { id: string; import_ref: string }[];
      },
      async insertAudit(entries) {
        const { error } = await supabase.from("fulfillment_audit_logs").insert(entries.map((e) => ({ ...e, action: "CREATED" })));
        if (error) throw new Error(error.message);
      },
    };
  }
} else {
  // Offline: nomes informados à mão; ids fictícios só para o relatório (nunca gravados).
  sellers = (args.sellers ?? "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .map((name, i) => ({ id: `offline-${i + 1}`, name, active: true }));
}

const result = await dryRun({ csvText, rawFile: raw, label: args.label, sellers, readDb });
if (!result.ok) {
  console.error(`Erro: ${result.error}`);
  process.exit(1);
}

console.log(formatReport(result.report, "DRY-RUN"));
if (args.json) {
  fs.writeFileSync(args.json, JSON.stringify(result.report, null, 2));
  console.log(`\nRelatório JSON salvo em ${args.json}`);
}

if (!args.apply) {
  console.log(`\nNada foi gravado. Para aplicar (somente com aprovação): --db --apply --confirm ${result.report.batchId} --actor <uuid>`);
  process.exit(0);
}

if (!readDb || !writeDb) usage("--apply exige --db.");
const existingRefs = await readDb.findExistingImportRefs(
  result.plan.rows.filter((r) => r.status === "valid").map((r) => r.record!.import_ref)
);
const applied = await applyImport({
  plan: result.plan,
  report: result.report,
  confirm: args.confirm,
  actorId: args.actor,
  writeDb,
  existingRefs,
});
if (!applied.ok) {
  console.error(`\nNÃO aplicado: ${applied.error}`);
  process.exit(1);
}
console.log(`\nAplicado: ${applied.inserted} inserido(s), ${applied.skippedAlreadyImported} já importado(s), ${applied.rejectedNotImported} rejeitada(s) não importadas.`);
