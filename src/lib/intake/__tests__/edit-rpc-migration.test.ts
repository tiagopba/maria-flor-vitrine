import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CONFERENCE_AFFECTING_COLUMNS } from "../edit.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");
const MIGRATION = read("supabase/migrations/20261016100000_fulfillment_intake_admin_edit.sql");
const FN = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.edit_fulfillment_intake"));
const FN_SQL_ONLY = FN.split("\n")
  .map((l) => (l.trim().startsWith("--") ? "" : l.replace(/--.*$/, "")))
  .join("\n");

describe("20261016100000: proposta, aditiva, não aplicada", () => {
  it("proposta, não aplicada", () => {
    assert.match(MIGRATION, /PROPOSTA — NÃO APLICADA/);
  });

  it("não é destrutiva: sem DELETE, TRUNCATE nem UPDATE fora da função de edição", () => {
    const outsideFunction = MIGRATION.slice(0, MIGRATION.indexOf("create or replace function public.edit_fulfillment_intake"));
    assert.doesNotMatch(outsideFunction, /\btruncate\b/i);
    assert.doesNotMatch(outsideFunction, /\bdelete from\b/i);
    assert.doesNotMatch(outsideFunction, /\bupdate\s+fulfillment_intakes\b/i);
  });

  it("não edita migration já aplicada: nenhuma referência a ALTER em tabelas fora desta feature", () => {
    assert.doesNotMatch(MIGRATION, /alter table public\.fulfillment_records\b/);
    assert.doesNotMatch(MIGRATION, /alter table public\.fulfillment_verification_attempts\b/);
  });
});

describe("20261016100000: INTAKE_EDITED no audit log genérico", () => {
  it("adiciona a ação mantendo todas as anteriores", () => {
    assert.match(MIGRATION, /fulfillment_intake_audit_logs_action_check/);
    for (const action of [
      "INTAKE_CREATED",
      "INTAKE_LINK_OPENED",
      "INTAKE_DATA_RECEIVED",
      "INTAKE_LINK_REOPENED",
      "INTAKE_CHECK_STARTED",
      "INTAKE_BLOCKED",
      "INTAKE_CHECK_RESTARTED",
      "INTAKE_REVIEW_COMPLETED",
      "INTAKE_APPROVED",
      "FULFILLMENT_CREATED",
      "INTAKE_CANCELLED",
      "INTAKE_EDITED",
    ]) {
      assert.match(MIGRATION, new RegExp(`'${action}'`), `ação ausente: ${action}`);
    }
  });
});

describe("20261016100000: fulfillment_intake_edit_history — histórico privado, append-only", () => {
  const TABLE = MIGRATION.slice(
    MIGRATION.indexOf("create table if not exists public.fulfillment_intake_edit_history"),
    MIGRATION.indexOf("create index if not exists fulfillment_intake_edit_history_intake_idx")
  );

  it("guarda reason_code, reason_note, fields_changed e conference_invalidated — nunca old/new value", () => {
    assert.match(TABLE, /reason_code text not null check/);
    assert.match(TABLE, /reason_note text check/);
    assert.match(TABLE, /fields_changed text\[\] not null/);
    assert.match(TABLE, /conference_invalidated boolean not null/);
    assert.doesNotMatch(TABLE, /old_value|new_value|previous_value/i);
  });

  it("reason_note só existe (e é obrigatória) quando reason_code = 'OTHER'", () => {
    assert.match(TABLE, /\(reason_code = 'OTHER'\) = \(reason_note is not null\)/);
  });

  it("RLS: só is_admin() lê; sem policy de insert/update/delete para anon/authenticated", () => {
    assert.match(MIGRATION, /fulfillment_intake_edit_history enable row level security/);
    assert.match(MIGRATION, /create policy "fulfillment_intake_edit_history_admin_select"[\s\S]*?for select using \(is_admin\(\)\);/);
    assert.match(MIGRATION, /revoke insert, update, delete on table public\.fulfillment_intake_edit_history from anon, authenticated;/);
    assert.doesNotMatch(MIGRATION, /create policy "fulfillment_intake_edit_history_admin_insert"/);
  });

  it("anon sem nenhum privilégio na tabela", () => {
    assert.match(MIGRATION, /revoke all on table public\.fulfillment_intake_edit_history from anon;/);
  });
});

describe("20261016100000: edit_fulfillment_intake — RPC SECURITY DEFINER atômica", () => {
  it("é SECURITY DEFINER, checa is_admin() antes de ler ou escrever qualquer coisa", () => {
    assert.match(FN, /security definer/);
    const beforeFirstSelect = FN.slice(0, FN.indexOf("select * into v_intake"));
    assert.match(beforeFirstSelect, /if not is_admin\(\) then/);
  });

  it("não tem nenhum 'exception when' que possa engolir erro e deixar parte do trabalho salva", () => {
    assert.doesNotMatch(FN, /exception\s+when/i);
  });

  it("recusa editar intake APPROVED ou CANCELLED", () => {
    assert.match(FN, /status in \('APPROVED', 'CANCELLED'\)/);
  });

  it("motivo: código fechado; 'OTHER' exige nota; os demais não aceitam nota", () => {
    assert.match(FN, /'SALE_TYPO', 'CUSTOMER_REQUESTED_CORRECTION', 'NFE_ISSUANCE_CORRECTION', 'OTHER'/);
    assert.match(FN, /if p_reason_code = 'OTHER' then/);
    assert.match(FN, /elsif p_reason_note is not null then/);
  });

  it("a ordem das escritas é UPDATE, depois audit log, depois histórico privado — todas antes do RETURN, nenhum COMMIT no meio", () => {
    const updateIdx = FN.indexOf("update fulfillment_intakes set");
    const auditIdx = FN.indexOf("insert into fulfillment_intake_audit_logs");
    const historyIdx = FN.indexOf("insert into fulfillment_intake_edit_history");
    const returnIdx = FN.indexOf("return jsonb_build_object");
    assert.ok(updateIdx > -1 && auditIdx > updateIdx && historyIdx > auditIdx && returnIdx > historyIdx);
    assert.doesNotMatch(FN, /\bcommit\b/i);
    assert.doesNotMatch(FN, /\bsavepoint\b/i);
  });

  it("audit log genérico só guarda fields/reason/conferenceInvalidated — nunca p_reason_note", () => {
    const auditCall = FN.slice(FN.indexOf("insert into fulfillment_intake_audit_logs"), FN.indexOf("insert into fulfillment_intake_edit_history"));
    assert.match(auditCall, /jsonb_build_object\('fields', to_jsonb\(v_fields\), 'reason', p_reason_code, 'conferenceInvalidated'/);
    assert.doesNotMatch(auditCall, /p_reason_note/);
  });

  it("histórico privado grava p_reason_note (só ali)", () => {
    const historyCall = FN.slice(FN.indexOf("insert into fulfillment_intake_edit_history"));
    assert.match(historyCall, /p_reason_note/);
  });

  it("nunca sobe status sozinho fora da lista de estados com tentativa desatualizada, e só quando um campo de conferência mudou", () => {
    assert.match(FN, /if v_conference_affected and v_intake\.status in \('DOCUMENTS_PENDING', 'CHECKING', 'REVIEW_REQUIRED', 'BLOCKED'\) then/);
    assert.match(FN, /v_next_status := 'DATA_RECEIVED';/);
  });

  it("não faz UPDATE nem INSERT nenhum em fulfillment_verification_attempts — a tentativa anterior nunca é tocada", () => {
    assert.doesNotMatch(FN_SQL_ONLY, /fulfillment_verification_attempts/);
  });

  it("recusa quando nada mudou, antes de qualquer escrita", () => {
    const guardIdx = FN.indexOf("array_length(v_fields, 1) is null");
    const updateIdx = FN.indexOf("update fulfillment_intakes set");
    assert.ok(guardIdx > -1 && guardIdx < updateIdx);
  });

  it("privilégios: só authenticated executa; anon e PUBLIC não (is_admin() decide quem realmente pode)", () => {
    assert.match(MIGRATION, /revoke all on function public\.edit_fulfillment_intake\(uuid, jsonb, text, text\) from public, anon;/);
    assert.match(MIGRATION, /grant execute on function public\.edit_fulfillment_intake\(uuid, jsonb, text, text\) to authenticated;/);
  });
});

describe("20261016100000: revisão de segurança/integridade (search_path, grants, whitelist do patch)", () => {
  it("SET search_path explícito e seguro — não depende do search_path da sessão", () => {
    const beforeAs = FN.slice(0, FN.indexOf("as $$"));
    assert.match(beforeAs, /security definer/);
    assert.match(beforeAs, /set search_path = public/);
  });

  it("PUBLIC e anon sem EXECUTE; authenticated só porque is_admin() decide por dentro", () => {
    assert.match(MIGRATION, /revoke all on function public\.edit_fulfillment_intake\(uuid, jsonb, text, text\) from public, anon;/);
    assert.match(MIGRATION, /grant execute on function public\.edit_fulfillment_intake\(uuid, jsonb, text, text\) to authenticated;/);
    // A recusa de quem não é admin/master vem do "if not is_admin()" dentro da função
    // (provado de verdade, com chamada direta, em edit-rpc-atomicity.test.ts), não de
    // faltar GRANT — GRANT EXECUTE sozinho nunca filtra por papel de aplicação.
    assert.match(FN, /if not is_admin\(\) then/);
  });

  it("whitelist: toda chave de p_patch fora da lista permitida é rejeitada, nunca ignorada em silêncio", () => {
    assert.match(FN, /for v_key in select jsonb_object_keys\(p_patch\) loop/);
    assert.match(FN, /raise exception 'campo não permitido nesta edição: %', v_key/);
  });

  it("os 8 campos da venda são sempre obrigatórios no patch (ausência é recusada, não tratada como 'sem mudança')", () => {
    assert.match(FN, /for v_key in select unnest\(v_sale_keys\) loop/);
    assert.match(FN, /raise exception 'campo obrigatório ausente: %', v_key/);
  });

  it("dados da cliente são tudo ou nada: patch parcial (alguns dos 13) é recusado", () => {
    assert.match(FN, /raise exception 'dados da cliente incompletos no patch';/);
  });

  it("whitelist (sale + customer) cobre exatamente as colunas administrativas — nunca id/status/approved_record_id/token/timestamps/paths/auditoria", () => {
    const FORBIDDEN = [
      "'id'",
      "'status'",
      "'approved_record_id'",
      "'token_hash'",
      "'token_expires_at'",
      "'submitted_at'",
      "'cancelled_at'",
      "'cancel_reason'",
      "'cancel_note'",
      "'created_at'",
      "'updated_at'",
      "'xml_file_path'",
      "'danfe_file_path'",
      "'label_file_path'",
    ];
    const declareBlock = FN.slice(FN.indexOf("v_sale_keys text[]"), FN.indexOf("v_key text;"));
    for (const forbidden of FORBIDDEN) {
      assert.doesNotMatch(declareBlock, new RegExp(forbidden.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `coluna proibida apareceu na whitelist: ${forbidden}`);
    }
  });

  it("a instrução UPDATE em si nunca escreve 'status = p_patch' nem lê id/approved_record_id/token/paths do patch", () => {
    const updateBlock = FN.slice(FN.indexOf("update fulfillment_intakes set"), FN.indexOf("where id = p_intake;"));
    assert.match(updateBlock, /status = v_next_status,/);
    assert.doesNotMatch(updateBlock, /p_patch->>'status'/);
    assert.doesNotMatch(updateBlock, /p_patch->>'id'/);
    assert.doesNotMatch(updateBlock, /p_patch->>'approved_record_id'/);
    assert.doesNotMatch(updateBlock, /token_hash|token_expires_at|xml_file_path|danfe_file_path|label_file_path/);
  });

  it("whitelist roda ANTES de travar a linha (não gasta um lock por um patch já inválido)", () => {
    const whitelistIdx = FN.indexOf("for v_key in select jsonb_object_keys(p_patch) loop");
    const lockIdx = FN.indexOf("select * into v_intake from fulfillment_intakes where id = p_intake for update");
    assert.ok(whitelistIdx > -1 && lockIdx > whitelistIdx);
  });
});

describe("20261016100000: fulfillment_intake_edit_history — limites de reason_note e fields_changed", () => {
  const TABLE = MIGRATION.slice(
    MIGRATION.indexOf("create table if not exists public.fulfillment_intake_edit_history"),
    MIGRATION.indexOf("create index if not exists fulfillment_intake_edit_history_intake_idx")
  );

  it("reason_note tem limite de 280 caracteres quando preenchida", () => {
    assert.match(TABLE, /length\(reason_note\) between 1 and 280/);
  });

  it("fields_changed nunca fica vazio (constraint no banco, não só no código)", () => {
    assert.match(TABLE, /check \(array_length\(fields_changed, 1\) > 0\)/);
  });

  it("admin/master podem SELECT; grant de select para authenticated existe mas é a RLS (is_admin()) quem decide", () => {
    assert.match(MIGRATION, /grant select on table public\.fulfillment_intake_edit_history to authenticated;/);
    assert.match(MIGRATION, /create policy "fulfillment_intake_edit_history_admin_select"[\s\S]*?for select using \(is_admin\(\)\);/);
  });
});

describe("20261016100000: paridade entre CONFERENCE_AFFECTING_COLUMNS (TS) e v_conference_affected (SQL)", () => {
  // Janela curta (até a próxima linha "end if;") depois de marcar o campo como alterado —
  // é onde "v_conference_affected := true;" aparece, nas mesmas poucas linhas, nunca longe.
  const windowAfterField = (column: string) => {
    const marker = `v_fields := array_append(v_fields, '${column}');`;
    const idx = FN.indexOf(marker);
    assert.ok(idx > -1, `coluna não encontrada na função: ${column}`);
    const endIfIdx = FN.indexOf("end if;", idx);
    return FN.slice(idx, endIfIdx > -1 ? endIfIdx : idx + marker.length + 80);
  };

  it("toda coluna da lista TS marca v_conference_affected := true na mesma janela, na função SQL", () => {
    for (const column of CONFERENCE_AFFECTING_COLUMNS) {
      assert.match(windowAfterField(column), /v_conference_affected := true;/, `coluna sem invalidar conferência no SQL: ${column}`);
    }
  });

  it("sti3_sale_id, seller_id, sale_date, payment_method e internal_notes NÃO marcam v_conference_affected", () => {
    for (const column of ["sti3_sale_id", "seller_id", "sale_date", "payment_method", "internal_notes"]) {
      assert.doesNotMatch(windowAfterField(column), /v_conference_affected/, `coluna não deveria afetar a conferência: ${column}`);
    }
  });

  it("a função SQL não marca v_conference_affected := true para nenhuma coluna fora da lista TS (sem drift silencioso)", () => {
    const occurrences = [...FN.matchAll(/v_fields := array_append\(v_fields, '([a-z_]+)'\);[\s\S]{0,40}?v_conference_affected := true;/g)].map((m) => m[1]);
    // sale_total é multilinha (atribuído via v_new_sale_total antes do if) — conferido à parte.
    const sqlColumns = new Set([...occurrences, "sale_total"]);
    assert.deepEqual([...sqlColumns].sort(), [...CONFERENCE_AFFECTING_COLUMNS].sort());
  });
});
