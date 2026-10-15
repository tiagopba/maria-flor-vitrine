import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8").split("\r\n").join("\n");
const MIGRATION = read("supabase/migrations/20261016110000_fulfillment_intake_edit_history_least_privilege.sql");
const SQL_ONLY = MIGRATION.split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

describe("20261016110000: endurecimento de privilégios de fulfillment_intake_edit_history", () => {
  it("proposta, não aplicada", () => {
    assert.match(MIGRATION, /PROPOSTA — NÃO APLICADA/);
  });

  it("REVOKE ALL de PUBLIC, anon e authenticated, nessa ordem, antes de qualquer GRANT", () => {
    const revokeIdx = SQL_ONLY.indexOf("revoke all on table public.fulfillment_intake_edit_history");
    const grantIdx = SQL_ONLY.indexOf("grant select on table public.fulfillment_intake_edit_history");
    assert.ok(revokeIdx > -1 && grantIdx > revokeIdx, "o REVOKE ALL precisa vir antes do GRANT SELECT");
    assert.match(SQL_ONLY, /revoke all on table public\.fulfillment_intake_edit_history\s*\nfrom public, anon, authenticated;/);
  });

  it("depois do REVOKE ALL, só GRANT SELECT para authenticated — nunca INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER concedidos de volta", () => {
    assert.match(SQL_ONLY, /grant select on table public\.fulfillment_intake_edit_history to authenticated;/);
    const afterRevoke = SQL_ONLY.slice(SQL_ONLY.indexOf("grant select"));
    assert.doesNotMatch(afterRevoke, /\binsert\b|\bupdate\b|\bdelete\b|\btruncate\b|\breferences\b|\btrigger\b/i);
  });

  it("nenhum GRANT para PUBLIC nem anon em lugar nenhum da migration", () => {
    assert.doesNotMatch(SQL_ONLY, /grant\s+\w+.*to\s+(public|anon)\b/i);
  });

  it("não mexe em RLS nem na função edit_fulfillment_intake", () => {
    assert.doesNotMatch(SQL_ONLY, /drop policy|create policy|alter table.*enable row level security/i);
    assert.doesNotMatch(SQL_ONLY, /create (or replace )?function|edit_fulfillment_intake\(/);
  });

  it("não mexe em service_role nem postgres, não usa CASCADE", () => {
    assert.doesNotMatch(SQL_ONLY, /service_role|\bpostgres\b/);
    assert.doesNotMatch(SQL_ONLY, /cascade/i);
  });

  it("é uma migration nova, posterior a 20261016100000, e não edita nenhuma migration já aplicada", () => {
    assert.doesNotMatch(SQL_ONLY, /create table|create or replace function|alter table public\.fulfillment_intake_audit_logs/i);
  });
});
