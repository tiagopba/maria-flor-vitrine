import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");
const MIGRATION = read("supabase/migrations/20261015100000_fulfillment_tracking_pending.sql");
const SQL_ONLY = MIGRATION.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

describe("fulfillment_tracking_pending: proposta, aditiva, não aplicada", () => {
  it("proposta, não aplicada", () => {
    assert.match(MIGRATION, /PROPOSTA — NÃO APLICADA/);
  });

  it("não é destrutiva: sem DELETE nem TRUNCATE, e não mexe em registros existentes", () => {
    assert.doesNotMatch(SQL_ONLY, /\btruncate\b/i);
    assert.doesNotMatch(SQL_ONLY, /\bdelete from\b/i);
    assert.doesNotMatch(SQL_ONLY, /\bupdate\s+fulfillment_records\b/i);
  });
});

describe("fulfillment_tracking_pending: TRACKING_CODE_SAVED", () => {
  it("adiciona a ação ao constraint de fulfillment_audit_logs mantendo todas as anteriores", () => {
    assert.match(MIGRATION, /fulfillment_audit_logs_action_check/);
    for (const action of [
      "CREATED",
      "DOCUMENT_VIEWED",
      "DELIVERY_UPDATED",
      "TRACKING_WHATSAPP_OPENED",
      "TRACKING_MESSAGE_CONFIRMED",
      "DELIVERY_CONFIRMATION_WHATSAPP_OPENED",
      "DELIVERY_CONFIRMATION_CONFIRMED",
      "GOOGLE_REVIEW_WHATSAPP_OPENED",
      "GOOGLE_REVIEW_CONFIRMED",
      "TRACKING_CODE_SAVED",
    ]) {
      assert.match(MIGRATION, new RegExp(`'${action}'`), `ação ausente: ${action}`);
    }
  });
});

describe("fulfillment_tracking_pending: xml_file_path", () => {
  it("fulfillment_records ganha xml_file_path (aditiva, nullable)", () => {
    assert.match(MIGRATION, /alter table public\.fulfillment_records add column if not exists xml_file_path text;/);
  });

  it("fulfillment_verification_attempts: danfe/label deixam de ser NOT NULL e ganham xml_file_path", () => {
    assert.match(
      MIGRATION,
      /alter table public\.fulfillment_verification_attempts alter column danfe_file_path drop not null;/
    );
    assert.match(
      MIGRATION,
      /alter table public\.fulfillment_verification_attempts alter column label_file_path drop not null;/
    );
    assert.match(MIGRATION, /alter table public\.fulfillment_verification_attempts add column if not exists xml_file_path text;/);
  });

  it("CHECK de compatibilidade: xml_file_path OU os dois PDFs — nunca tentativa sem documento nenhum", () => {
    const check = MIGRATION.slice(MIGRATION.indexOf("fulfillment_verification_attempts_has_documents_check"));
    assert.match(check, /xml_file_path is not null/);
    assert.match(check, /danfe_file_path is not null and label_file_path is not null/);
  });
});

describe("fulfillment_tracking_pending: bucket aceita XML ao lado do PDF", () => {
  it("adiciona application/xml e text/xml sem remover application/pdf (fluxo antigo continua subindo PDF)", () => {
    const section = MIGRATION.slice(MIGRATION.indexOf("update storage.buckets"), MIGRATION.indexOf("where id = 'fulfillment-documents';") + 40);
    assert.match(section, /'application\/pdf'/);
    assert.match(section, /'application\/xml'/);
  });
});

describe("fulfillment_tracking_pending: approve_fulfillment_intake continua tolerando campos ausentes", () => {
  const fn = () => MIGRATION.slice(MIGRATION.indexOf("create or replace function public.approve_fulfillment_intake"));

  it("insere xml_file_path a partir de p_record, junto com danfe/label (nenhum dos três é exigido)", () => {
    assert.match(fn(), /danfe_file_path, label_file_path, xml_file_path, sale_total/);
    assert.match(fn(), /p_record->>'danfe_file_path', p_record->>'label_file_path', p_record->>'xml_file_path',/);
  });

  it("preserva as validações de aprovação existentes (admin, tentativa atual, BLOCKED nunca aprova)", () => {
    assert.match(fn(), /if not is_admin\(\) then/);
    assert.match(fn(), /só a tentativa atual pode ser aprovada/);
    assert.match(fn(), /conferência bloqueada: não há aprovação com divergência crítica/);
  });

  it("aprovação XML-only cria o fulfillment com delivery_status PENDING, igual qualquer outra aprovação", () => {
    assert.match(fn(), /v_intake\.sale_date, v_intake\.seller_id, null, 'PENDING', 'CONFIRMED',/);
  });

  it("mantém sti3_sale_id e a auditoria CREATED/INTAKE_APPROVED/FULFILLMENT_CREATED intactas", () => {
    assert.match(fn(), /sti3_sale_id/);
    assert.match(fn(), /'CREATED', v_actor, jsonb_build_object\('source', 'FULFILLMENT_INTAKE'\)/);
    assert.match(fn(), /'INTAKE_APPROVED'/);
    assert.match(fn(), /'FULFILLMENT_CREATED'/);
  });

  it("privilégios da função continuam só para authenticated (nada para anon/public)", () => {
    assert.match(MIGRATION, /revoke all on function public\.approve_fulfillment_intake\(uuid, integer, jsonb\) from public, anon;/);
    assert.match(MIGRATION, /grant execute on function public\.approve_fulfillment_intake\(uuid, integer, jsonb\) to authenticated;/);
  });
});
