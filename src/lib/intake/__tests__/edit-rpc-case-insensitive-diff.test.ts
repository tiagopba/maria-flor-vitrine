import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");
const MIGRATION = read("supabase/migrations/20261017100000_fulfillment_intake_edit_case_insensitive_diff.sql");
const FN = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.edit_fulfillment_intake"));

// As 7 colunas que o Zod normaliza para CAIXA ALTA (ver edit-schema.ts): a diferença
// de caixa sozinha não deve contar como mudança para estas.
const UPPER_COMPARED_COLUMNS = [
  "submitted_name",
  "submitted_recipient_name",
  "submitted_address_line",
  "submitted_address_complement",
  "submitted_neighborhood",
  "submitted_city",
  "submitted_state",
];

// Colunas que continuam com comparação sensível a caixa (não são CAIXA ALTA).
const EXACT_COMPARED_COLUMNS = [
  "sti3_sale_id",
  "customer_name",
  "customer_whatsapp",
  "payment_method",
  "internal_notes",
  "submitted_cpf",
  "submitted_email",
  "submitted_whatsapp",
  "submitted_postal_code",
  "submitted_address_number",
];

describe("20261017100000: proposta, aditiva, não reescreve a migration já aplicada", () => {
  it("proposta, não aplicada", () => {
    assert.match(MIGRATION, /PROPOSTA — NÃO APLICADA/);
  });

  it("é create or replace function (mesma assinatura) — não é um ALTER na migration anterior", () => {
    assert.match(FN, /create or replace function public\.edit_fulfillment_intake\(/);
    assert.match(FN, /p_intake uuid,\s*\n\s*p_patch jsonb,\s*\n\s*p_reason_code text,\s*\n\s*p_reason_note text/);
  });

  it("não toca em fulfillment_intake_edit_history, audit log check nem políticas (já existem)", () => {
    assert.doesNotMatch(MIGRATION, /create table|drop policy|create policy|alter table public\.fulfillment_intake_audit_logs/);
  });
});

describe("20261017100000: diferença só de caixa não conta como mudança, nos 7 campos CAIXA ALTA", () => {
  for (const column of UPPER_COMPARED_COLUMNS) {
    it(`${column}: comparação usa upper(...) is distinct from upper(...)`, () => {
      const pattern = new RegExp(`upper\\(p_patch->>'${column}'\\) is distinct from upper\\(v_intake\\.${column}\\)`);
      assert.match(FN, pattern, `coluna sem comparação case-insensitive: ${column}`);
    });
  }

  for (const column of EXACT_COMPARED_COLUMNS) {
    it(`${column}: continua comparação exata (não é CAIXA ALTA, diferença de caixa nele é real)`, () => {
      const pattern = new RegExp(`\\(p_patch->>'${column}'\\) is distinct from v_intake\\.${column}\\b`);
      assert.match(FN, pattern, `coluna deveria continuar com comparação exata: ${column}`);
      assert.doesNotMatch(FN, new RegExp(`upper\\(p_patch->>'${column}'\\)`), `coluna não deveria usar upper(): ${column}`);
    });
  }
});

describe("20261017100000: UPDATE continua gravando o valor normalizado (CAIXA ALTA) sempre, não só quando 'mudou'", () => {
  it("todas as colunas CAIXA ALTA aparecem no UPDATE sem condicionar ao resultado da comparação", () => {
    const updateBlock = FN.slice(FN.indexOf("update fulfillment_intakes set"), FN.indexOf("where id = p_intake;"));
    for (const column of UPPER_COMPARED_COLUMNS) {
      assert.match(updateBlock, new RegExp(`${column} = case when v_has_customer_fields then p_patch->>'${column}'`), `UPDATE não grava mais ${column}`);
    }
  });
});

describe("20261017100000: privilégios inalterados", () => {
  it("mesmo revoke/grant da versão anterior", () => {
    assert.match(MIGRATION, /revoke all on function public\.edit_fulfillment_intake\(uuid, jsonb, text, text\) from public, anon;/);
    assert.match(MIGRATION, /grant execute on function public\.edit_fulfillment_intake\(uuid, jsonb, text, text\) to authenticated;/);
  });
});
