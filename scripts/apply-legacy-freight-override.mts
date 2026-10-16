// Regularização do override de frete legado (LEGACY_FREIGHT_VALUE_OVERRIDE).
//
//   node scripts/apply-legacy-freight-override.mts [--intake <id>] [--json out.json]
//
// PADRÃO = DRY-RUN: lê o intake e a tentativa mais recente, mostra exatamente
// o que mudaria, NÃO GRAVA NADA.
//   --apply --confirm <id> --actor <uuid>   grava o override (chama a RPC
//                                            apply_legacy_freight_override,
//                                            tabela + audit log na mesma
//                                            transação). Só com aprovação.
//
// Nesta rodada, o único intake elegível é a Tatiane (STI3 23771) — os
// outros 3 candidatos da mesma leva (Fabiane/Beatriz/Daniela, STI3
// 23716/23739/23751) foram conferidos manualmente e NÃO têm divergência de
// valor, então não entram aqui. Por isso o script recusa qualquer outro id.
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const ELIGIBLE_INTAKE_ID = "e3eefc98-46d0-4e6a-b261-d48f47dac11f";
const ELIGIBLE_STI3 = "23771";

function usage(message?: string): never {
  if (message) console.error(`Erro: ${message}\n`);
  console.error(
    [
      "Uso: node scripts/apply-legacy-freight-override.mts [--intake <id>] [--json out.json]",
      "     (padrão: DRY-RUN, não grava nada)",
      "     node scripts/apply-legacy-freight-override.mts --apply --confirm <id> --actor <uuid>",
    ].join("\n")
  );
  process.exit(message ? 1 : 0);
}

function parseArgs(argv: string[]) {
  const args = {
    intake: ELIGIBLE_INTAKE_ID,
    json: undefined as string | undefined,
    apply: false,
    confirm: undefined as string | undefined,
    actor: undefined as string | undefined,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--intake") args.intake = argv[++i];
    else if (a === "--json") args.json = argv[++i];
    else if (a === "--apply") args.apply = true;
    else if (a === "--confirm") args.confirm = argv[++i];
    else if (a === "--actor") args.actor = argv[++i];
    else if (a === "--help" || a === "-h") usage();
    else usage(`opção desconhecida: ${a}`);
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

if (args.intake !== ELIGIBLE_INTAKE_ID) {
  usage(
    `nesta rodada só o intake ${ELIGIBLE_INTAKE_ID} (STI3 ${ELIGIBLE_STI3}, Tatiane) é elegível — ` +
      `Fabiane/Beatriz/Daniela foram conferidas manualmente e não têm divergência de valor.`
  );
}
if (args.apply && (!args.confirm || !args.actor)) usage("--apply exige --confirm <id> e --actor <uuid>.");

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) usage("precisa de NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.");
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: intake, error: intakeError } = await supabase
  .from("fulfillment_intakes")
  .select("id, sti3_sale_id, status, sale_total")
  .eq("id", args.intake)
  .maybeSingle();
if (intakeError) {
  console.error(`Erro ao ler o intake: ${intakeError.message}`);
  process.exit(1);
}
if (!intake) {
  console.error(`Intake ${args.intake} não encontrado.`);
  process.exit(1);
}

const { data: attempts, error: attemptsError } = await supabase
  .from("fulfillment_verification_attempts")
  .select("attempt_no, verdict, blocking_fields, review_fields, comparison")
  .eq("intake_id", args.intake)
  .order("attempt_no", { ascending: false })
  .limit(1);
if (attemptsError) {
  console.error(`Erro ao ler a tentativa: ${attemptsError.message}`);
  process.exit(1);
}
const latest = (attempts ?? [])[0] ?? null;

const { data: existingOverride, error: overrideError } = await supabase
  .from("fulfillment_intake_legacy_overrides")
  .select("id, created_at, revoked_at")
  .eq("intake_id", args.intake)
  .eq("override_type", "LEGACY_FREIGHT_VALUE_OVERRIDE")
  .is("revoked_at", null)
  .maybeSingle();
// A migration pode ainda não estar aplicada (42P01 via Postgres direto, ou
// PGRST205 "not found in schema cache" via PostgREST, que é o que normalmente
// aparece aqui) — nesse caso, ainda sem a tabela, o dry-run trata como "sem
// override" (é exatamente a realidade: não há nenhum override, aplicado ou
// não). Qualquer OUTRO erro (ex.: rede, permissão) interrompe o script.
const migrationNotApplied = overrideError?.code === "42P01" || overrideError?.code === "PGRST205";
if (overrideError && !migrationNotApplied) {
  console.error(`Erro ao checar override existente: ${overrideError.message}`);
  process.exit(1);
}

const invoiceTotal = (latest?.comparison as { extracted?: { invoice_total?: number | null } } | null)?.extracted?.invoice_total ?? null;
const saleTotal = Number(intake.sale_total);
const valueDivergence = latest && invoiceTotal !== null ? Math.round((saleTotal - invoiceTotal) * 100) / 100 : null;
const valorBlocked = latest?.blocking_fields?.includes("valor") ?? false;

const report = {
  intakeId: intake.id,
  sti3: intake.sti3_sale_id,
  status: intake.status,
  saleTotal,
  latestAttempt: latest
    ? { attemptNo: latest.attempt_no, verdict: latest.verdict, blockingFields: latest.blocking_fields, reviewFields: latest.review_fields, invoiceTotal, valueDivergence }
    : null,
  alreadyHasActiveOverride: existingOverride != null,
  eligible: intake.status !== "APPROVED" && intake.status !== "CANCELLED" && !existingOverride,
};

console.log("── DRY-RUN: override de frete legado ──────────────────────────");
if (migrationNotApplied) {
  console.log("(migration 20261018120000 ainda não aplicada — leitura de override tratada como \"nenhum\")");
}
console.log(`Intake:          ${report.intakeId}`);
console.log(`STI3:            ${report.sti3}`);
console.log(`Status atual:    ${report.status}`);
console.log(`Valor da venda:  R$ ${saleTotal.toFixed(2)}`);
if (latest) {
  console.log(`Tentativa atual: #${latest.attempt_no}, veredito ${latest.verdict}`);
  console.log(`  blocking_fields: ${JSON.stringify(latest.blocking_fields)}`);
  console.log(`  review_fields:   ${JSON.stringify(latest.review_fields)}`);
  console.log(`  valor da NF-e extraído: ${invoiceTotal === null ? "—" : `R$ ${invoiceTotal.toFixed(2)}`}`);
  console.log(`  divergência (venda - NF-e): ${valueDivergence === null ? "—" : `R$ ${valueDivergence.toFixed(2)}`}`);
  console.log(`  "valor" está em blocking_fields: ${valorBlocked ? "SIM" : "não"}`);
} else {
  console.log("Tentativa atual: nenhuma ainda (sem XML enviado).");
}
console.log(`Já tem override ativo: ${report.alreadyHasActiveOverride ? "SIM — nada a fazer" : "não"}`);
console.log(`Elegível para aplicar: ${report.eligible ? "SIM" : "NÃO"}`);
console.log("");
console.log("Efeito esperado se aplicado:");
if (!report.eligible) {
  console.log("  Nenhum — não elegível (ver motivo acima).");
} else if (latest && valorBlocked) {
  console.log(
    "  Na PRÓXIMA conferência desta intake (precisa reenviar o XML, REFAZER CONFERÊNCIA),\n" +
      "  \"valor\" deixa de bloquear e vira aviso informativo \"Frete legado\" (não exige\n" +
      "  checkbox, não entra em blocking_fields/review_fields). Outros campos (ex.: bairro)\n" +
      "  continuam exigindo revisão normal. A tentativa atual, já registrada como BLOCKED,\n" +
      "  NÃO é alterada nem reescrita — fica no histórico exatamente como está."
  );
} else {
  console.log(
    "  O override fica pronto para a próxima conferência desta intake, mas ela ainda não\n" +
      "  tem uma tentativa com divergência de valor confirmada."
  );
}

if (args.json) {
  fs.writeFileSync(args.json, JSON.stringify(report, null, 2));
  console.log(`\nRelatório JSON salvo em ${args.json}`);
}

if (!args.apply) {
  console.log(
    `\nNada foi gravado. Para aplicar (somente com aprovação explícita):\n` +
      `  node scripts/apply-legacy-freight-override.mts --apply --confirm ${report.intakeId} --actor <uuid>`
  );
  process.exit(0);
}

// ── A partir daqui só roda com --apply (nesta rodada, nunca chamado) ───────
if (args.confirm !== report.intakeId) {
  console.error(`\nNÃO aplicado: --confirm (${args.confirm}) não bate com o intake_id (${report.intakeId}).`);
  process.exit(1);
}
if (!report.eligible) {
  console.error(`\nNÃO aplicado: intake não está mais elegível (status ${report.status} ou já tem override ativo).`);
  process.exit(1);
}

const { data: overrideId, error: applyError } = await supabase.rpc("apply_legacy_freight_override", {
  p_intake: report.intakeId,
  p_actor: args.actor,
});
if (applyError || !overrideId) {
  console.error(`\nNÃO aplicado: ${applyError?.message ?? "erro desconhecido"}`);
  process.exit(1);
}
console.log(`\nAplicado: override ${overrideId} criado para o intake ${report.intakeId}.`);
