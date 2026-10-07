import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");
const MIGRATION = read("supabase/migrations/20261007100000_fulfillment_followups.sql");
// Só o SQL de verdade, sem o texto dos comentários — "TRUNCATE" e "fulfillment_records"
// aparecem em prosa explicativa (grants, FK), não em comando algum.
const SQL_ONLY = MIGRATION.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("fulfillment_followups: modelagem", () => {
  it("3 tipos e os 2 status da V1, nada mais", () => {
    assert.match(MIGRATION, /type in \('SHIPPING_NOTICE', 'DELIVERY_CONFIRMATION', 'GOOGLE_REVIEW'\)/);
    assert.match(MIGRATION, /status in \('OPEN', 'SENT'\)/);
  });

  it("no máximo 1 follow-up de cada tipo por registro (UNIQUE)", () => {
    assert.match(MIGRATION, /unique \(record_id, type\)/);
  });

  it("SENT exige sent_at; OPEN não tem sent_at nem sent_by (consistência no banco)", () => {
    assert.match(MIGRATION, /fulfillment_followups_sent_consistency/);
    assert.match(MIGRATION, /status = 'OPEN' and sent_at is null and sent_by is null/);
    assert.match(MIGRATION, /status = 'SENT' and sent_at is not null/);
  });

  it("message_snapshot é opcional (follow-up antigo confirmado sem o texto guardado)", () => {
    assert.match(MIGRATION, /message_snapshot text,/);
  });
});

describe("fulfillment_followups: todo pedido ganha os 3, sempre OPEN", () => {
  it("trigger AFTER INSERT em fulfillment_records cria os 3, com ON CONFLICT DO NOTHING (nunca duplica)", () => {
    assert.match(MIGRATION, /create trigger fulfillment_records_create_followups\s*\n\s*after insert on public\.fulfillment_records/);
    const fn = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.fulfillment_create_followups"), MIGRATION.indexOf("create trigger"));
    assert.match(fn, /'SHIPPING_NOTICE'/);
    assert.match(fn, /'DELIVERY_CONFIRMATION'/);
    assert.match(fn, /'GOOGLE_REVIEW'/);
    assert.match(fn, /on conflict \(record_id, type\) do nothing/);
    assert.doesNotMatch(fn, /status[\s\S]*?=[\s\S]*?'SENT'/i, "a criação nunca marca como já enviado");
  });

  it("backfill dos registros existentes usa o mesmo padrão idempotente", () => {
    const backfill = MIGRATION.slice(MIGRATION.indexOf("-- ── Backfill 1/2"), MIGRATION.indexOf("-- ── Backfill 2/2"));
    assert.match(backfill, /insert into fulfillment_followups \(record_id, type\)/);
    assert.match(backfill, /on conflict \(record_id, type\) do nothing/);
  });
});

describe("fulfillment_followups: backfill de histórico não inventa confirmação", () => {
  const backfill2 = () => MIGRATION.slice(MIGRATION.indexOf("-- ── Backfill 2/2"));

  it("é genérico e determinístico: lê a PRÓPRIA auditoria, não é um caso especial de cliente", () => {
    assert.match(backfill2(), /NÃO é heurística/);
    // A query decide por fulfillment_audit_logs, não por um ID fixo de registro.
    assert.match(backfill2(), /from fulfillment_audit_logs/);
    assert.match(backfill2(), /f\.record_id = c\.record_id/);
    // Trava: nunca sobrescreve um SENT já existente (idempotente, mesmo se rodar 2x).
    assert.match(backfill2(), /f\.status = 'OPEN'/);
  });

  it("NUNCA usa *_WHATSAPP_OPENED como evidência de envio — só os 3 *_CONFIRMED", () => {
    const action = backfill2().slice(backfill2().indexOf("where action in"), backfill2().indexOf(")\n"));
    assert.match(action, /TRACKING_MESSAGE_CONFIRMED/);
    assert.match(action, /DELIVERY_CONFIRMATION_CONFIRMED/);
    assert.match(action, /GOOGLE_REVIEW_CONFIRMED/);
    assert.doesNotMatch(action, /WHATSAPP_OPENED/);
  });

  it("usa a PRIMEIRA confirmação de cada (registro, ação), não a mais recente — o sistema antigo permitia reconfirmar depois de reabrir", () => {
    assert.match(backfill2(), /row_number\(\) over \(partition by record_id, action order by created_at asc\)/);
    assert.match(backfill2(), /c\.rn = 1/);
  });

  it("não grava message_snapshot no backfill: o texto histórico nunca existiu, e não é inventado", () => {
    assert.doesNotMatch(backfill2(), /message_snapshot\s*=/);
  });

  it("nenhum ID de cliente/registro específico está hardcoded em lugar nenhum da migration", () => {
    // Os dois IDs reais conhecidos neste projeto (Neusa e Rosiane) não podem aparecer
    // como literal — o resultado tem que vir só da leitura da auditoria em tempo de apply.
    assert.doesNotMatch(MIGRATION, /62bbd574-702c-4c31-9e51-a92f97325e50/);
    assert.doesNotMatch(MIGRATION, /6bbabf84-77a1-4de9-a190-a233b22c930b/);
    // E nenhum timestamp literal de confirmação (o backfill lê created_at da auditoria, não escreve um fixo).
    assert.doesNotMatch(MIGRATION, /set status = 'SENT', sent_at = '20\d\d-\d\d-\d\dT/);
  });
});

describe("fulfillment_followups: acesso", () => {
  it("RLS ligado, policies por is_admin(), sem policy de DELETE", () => {
    assert.match(MIGRATION, /alter table public\.fulfillment_followups enable row level security/);
    assert.match(MIGRATION, /fulfillment_followups_admin_select[\s\S]*?for select using \(is_admin\(\)\)/);
    assert.match(MIGRATION, /fulfillment_followups_admin_insert[\s\S]*?for insert with check \(is_admin\(\)\)/);
    assert.match(MIGRATION, /fulfillment_followups_admin_update[\s\S]*?for update using \(is_admin\(\)\) with check \(is_admin\(\)\)/);
    assert.doesNotMatch(MIGRATION, /for delete/);
  });

  it("least privilege: anon e PUBLIC sem nada; authenticated só select/insert/update (sem delete/truncate/trigger/references)", () => {
    assert.match(MIGRATION, /revoke all privileges on table public\.fulfillment_followups from anon, authenticated, public;/);
    assert.match(MIGRATION, /grant select, insert, update on table public\.fulfillment_followups to authenticated;/);
  });

  it("não remove nenhuma policy ou grant de outra tabela", () => {
    assert.doesNotMatch(SQL_ONLY, /drop policy[^\n]*\bon\b[^\n]*\bpublic\.fulfillment_records\b/);
    assert.doesNotMatch(SQL_ONLY, /\brevoke\b[^\n]*\bfulfillment_records\b/);
  });

  it("não é destrutiva: sem DELETE nem TRUNCATE em nenhuma tabela", () => {
    assert.doesNotMatch(SQL_ONLY, /\btruncate\b/i);
    assert.doesNotMatch(SQL_ONLY, /\bdelete from\b/i);
  });

  it("proposta, não aplicada", () => {
    assert.match(MIGRATION, /PROPOSTA — NÃO APLICADA/);
  });
});
