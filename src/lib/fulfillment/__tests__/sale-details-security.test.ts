import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").split("\r\n").join("\n");

const INTAKE_ACTIONS = "src/app/admin/faturamento-envios/pre/[id]/sale-details-actions.ts";
const RECORD_ACTIONS = "src/app/admin/faturamento-envios/[id]/sale-details-actions.ts";
const INTAKE_DB = "src/lib/db/intakes.ts";
const RECORD_DB = "src/lib/db/fulfillment.ts";
const MIGRATION = "supabase/migrations/20261030100000_fulfillment_sale_details_edit_audit.sql";

describe("EDITAR VENDA / EDITAR DADOS DA VENDA: acesso e nada confiado ao cliente", () => {
  it("as duas actions exigem Admin/Master", () => {
    for (const file of [INTAKE_ACTIONS, RECORD_ACTIONS]) {
      assert.match(read(file), /requireAdmin\(\["admin", "master"\]\)/, file);
    }
  });

  it("a regra de invalidar a conferência é recalculada no servidor: lê status e tentativas do banco, nunca de `raw`", () => {
    const source = read(INTAKE_ACTIONS);
    assert.match(source, /getIntakeRow\(intakeId\)/);
    assert.match(source, /listAttempts\(intakeId\)/);
    assert.match(source, /planIntakeSaleDetailsUpdate\(/);
    // Nenhum campo de status/tentativa é lido de `raw` (o que o cliente mandou).
    assert.doesNotMatch(source, /raw\.(status|hasAnyAttempt|forceDocumentsPending)/);
  });

  it("o valor novo e o status forçado são escritos na MESMA operação (updateIntakeSaleDetails), nunca em dois passos", () => {
    const fn = read(INTAKE_DB);
    const body = fn.slice(fn.indexOf("export async function updateIntakeSaleDetails"), fn.indexOf("export async function setIntakeStatusRow"));
    // Um único .update(...) nesta função — a condição do status forçado decide o payload
    // ANTES da chamada ao banco, não depois.
    assert.equal(body.match(/\.update\(/g)?.length, 1, "deve haver só uma chamada .update() nesta função");
    assert.match(body, /forceDocumentsPending \? \{ \.\.\.input\.update, status: "DOCUMENTS_PENDING" \} : input\.update/);
  });

  it("nunca escreve numa intake já aprovada ou cancelada, mesmo que o chamador tenha lido o estado antes (guard no próprio UPDATE)", () => {
    const fn = read(INTAKE_DB);
    const body = fn.slice(fn.indexOf("export async function updateIntakeSaleDetails"), fn.indexOf("export async function setIntakeStatusRow"));
    assert.match(body, /\.not\("status", "in", "\(APPROVED,CANCELLED\)"\)/);
  });

  it("EDITAR DADOS DA VENDA (pós-aprovação) não tem NENHUM caminho de código para sale_total", () => {
    // A action inteira: nenhum arquivo dela lê/grava valor.
    assert.doesNotMatch(read(RECORD_ACTIONS), /sale_total|saleTotal/i, RECORD_ACTIONS);
    // db/fulfillment.ts tem sale_total em outros lugares (listagem, filtros) — escopo
    // só à função nova, que não pode ganhar esse campo por engano no futuro.
    const dbSource = read(RECORD_DB);
    const fnBody = dbSource.slice(
      dbSource.indexOf("export async function updateFulfillmentSaleDetails"),
      dbSource.indexOf("export async function saveTrackingInfo")
    );
    assert.doesNotMatch(fnBody, /sale_total|saleTotal/i, "updateFulfillmentSaleDetails");
  });

  it("a action pós-aprovação usa a action SALE_DETAILS_UPDATED (nunca DELIVERY_UPDATED, que é sobre entrega)", () => {
    assert.match(read(RECORD_ACTIONS), /action: "SALE_DETAILS_UPDATED"/);
  });

  it("a action pré-aprovação reaproveita INTAKE_EDITED (nenhuma ação nova para fulfillment_intake_audit_logs)", () => {
    assert.match(read(INTAKE_ACTIONS), /action: "INTAKE_EDITED"/);
  });

  it("auditoria sem PII: só campos alterados e valores de negócio (não há CPF/endereço/telefone nas duas actions)", () => {
    for (const file of [INTAKE_ACTIONS, RECORD_ACTIONS]) {
      const source = read(file);
      assert.doesNotMatch(source, /cpf|address|endereco|telefone|whatsapp/i, file);
    }
  });

  it("vendedora é validada no servidor antes de salvar (ativa na intake; existente no record)", () => {
    assert.match(read(INTAKE_ACTIONS), /isActiveSeller\(parsed\.data\.sellerId\)/);
    assert.match(read(RECORD_ACTIONS), /sellerExists\(parsed\.data\.sellerId\)/);
  });
});

describe("migration 20261030100000: aditiva, idempotente, sem tocar dados", () => {
  const migration = read(MIGRATION);

  it("mesmo padrão idempotente (drop + add) das migrations anteriores desta tabela", () => {
    assert.match(migration, /drop constraint if exists fulfillment_audit_logs_action_check/);
    assert.match(migration, /drop constraint if exists fulfillment_intake_audit_logs_action_check/);
  });

  it("inclui a ação nova (SALE_DETAILS_UPDATED) e preserva todas as 10 ações antigas de fulfillment_audit_logs", () => {
    for (const a of [
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
      "SALE_DETAILS_UPDATED",
    ]) {
      assert.match(migration, new RegExp(`'${a}'`), a);
    }
  });

  it("preserva as 13 ações já documentadas de fulfillment_intake_audit_logs (inclusive INTAKE_EDITED), sem criar nenhuma nova", () => {
    for (const a of [
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
      "LEGACY_FREIGHT_OVERRIDE_APPLIED",
    ]) {
      assert.match(migration, new RegExp(`'${a}'`), a);
    }
  });

  // Só o SQL executável (sem comentários) — a prosa explica o que NÃO é tocado,
  // o que naturalmente cita essas palavras; são os comandos reais que precisam não ter.
  const sql = migration
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");

  it("nunca apaga nem altera dado (só comandos de constraint)", () => {
    assert.doesNotMatch(sql, /\b(delete|truncate|drop table|drop column|insert into|update\s+public\.)\b/i);
  });

  it("não cria/altera policy, grant nem RLS — só as duas constraints", () => {
    assert.doesNotMatch(sql, /\b(grant|revoke|create policy|alter policy|row level security)\b/i);
    assert.equal((sql.match(/\balter table\b/gi) ?? []).length, 4, "2 drop constraint + 2 add constraint");
  });
});
