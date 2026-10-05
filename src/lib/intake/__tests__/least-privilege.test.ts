import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const code = (p: string) => read(p).replace(/--.*$/gm, "");
const HARDENING = "supabase/migrations/20261005241000_fulfillment_intakes_least_privilege.sql";
const TABLES = ["fulfillment_intakes", "fulfillment_intake_audit_logs", "fulfillment_verification_attempts"];

const statements = (sql: string) => sql.split(";").map((s) => s.trim()).filter(Boolean);

describe("migration de least privilege do pré-faturamento", () => {
  const sql = code(HARDENING);
  const all = statements(sql);

  it("remove TODOS os privilégios das 3 tabelas de anon, authenticated e PUBLIC", () => {
    for (const t of TABLES) {
      assert.ok(
        all.some((s) => new RegExp(`^revoke all privileges\\s+on table public\\.${t}\\s+from anon, authenticated, public$`).test(s)),
        t
      );
    }
  });

  it("devolve a authenticated apenas select/insert/update (sem delete, truncate, trigger, references)", () => {
    const expected: Record<string, string> = {
      fulfillment_intakes: "select, insert, update",
      fulfillment_intake_audit_logs: "select, insert",
      fulfillment_verification_attempts: "select, insert, update",
    };
    for (const [t, privs] of Object.entries(expected)) {
      assert.ok(
        all.some((s) => new RegExp(`^grant ${privs}\\s+on table public\\.${t}\\s+to authenticated$`).test(s)),
        `${t}: ${privs}`
      );
    }
    for (const s of all.filter((x) => /^grant /i.test(x))) {
      assert.doesNotMatch(s, /\b(delete|truncate|trigger|references|all)\b/i, s);
      assert.doesNotMatch(s, /\bto (anon|public)\b/i, s);
    }
  });

  it("não concede nada a anon nem a PUBLIC", () => {
    assert.doesNotMatch(sql, /\bto (anon|public)\b/i);
    assert.doesNotMatch(sql, /grant[^;]*\bto anon\b/i);
  });

  it("não apaga, não altera dados, RLS, policies, função ou service_role", () => {
    assert.doesNotMatch(sql, /\b(delete from|insert into|update public\.|truncate public\.|drop table|cascade)\b/i);
    assert.doesNotMatch(sql, /\b(create|drop|alter)\s+policy\b|enable row level security|disable row level security|approve_fulfillment_intake|service_role|postgres/i);
  });

  it("não mexe em fulfillment_records (registros reais)", () => {
    assert.doesNotMatch(sql, /fulfillment_records/i);
  });
});
