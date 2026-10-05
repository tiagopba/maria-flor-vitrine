import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").split("\r\n").join("\n");

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(entry) && !rel.includes("__tests__")) out.push(rel);
  }
  return out;
}

const HARDENING = "supabase/migrations/20261005200000_sellers_least_privilege.sql";
const SELLERS_RLS = "supabase/migrations/20261005190000_sellers_rls_and_optional_whatsapp.sql";
const FULFILLMENT_HISTORY = "supabase/migrations/20261005190100_fulfillment_historical_import_support.sql";

// Remove comentários SQL (-- ...) para que o texto explicativo não gere falso positivo.
const sqlCode = (path: string) =>
  read(path)
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");

describe("migration de endurecimento de privilégios (sellers)", () => {
  const sql = sqlCode(HARDENING);

  it("é uma migration NOVA, posterior às duas já aplicadas, e as aplicadas não foram editadas", () => {
    const files = readdirSync(join(ROOT, "supabase/migrations")).sort();
    assert.ok(files.includes("20261005200000_sellers_least_privilege.sql"));
    assert.ok(files.indexOf("20261005200000_sellers_least_privilege.sql") > files.indexOf("20261005190100_fulfillment_historical_import_support.sql"));
    // As migrations aplicadas continuam sem nenhum comando de privilégio de anon.
    assert.doesNotMatch(sqlCode(SELLERS_RLS), /revoke all/i);
    assert.doesNotMatch(sqlCode(FULFILLMENT_HISTORY), /on table public\.sellers/i);
  });

  it("anon: revoke all em public.sellers e nenhum grant", () => {
    assert.match(sql, /revoke all on table public\.sellers from anon;/);
    assert.doesNotMatch(sql, /\bgrant\b/i);
  });

  it("authenticated: revoga TRUNCATE, REFERENCES e TRIGGER", () => {
    assert.match(sql, /revoke truncate, references, trigger\s+on table public\.sellers\s+from authenticated;/);
  });

  it("authenticated NÃO perde SELECT, INSERT nem UPDATE (a RLS is_admin() decide o acesso)", () => {
    const revokesForAuthenticated = sql.match(/revoke[^;]*from authenticated;/gi) ?? [];
    for (const statement of revokesForAuthenticated) {
      assert.doesNotMatch(statement, /\b(select|insert|update|delete)\b/i);
    }
  });

  it("nunca usa CASCADE, nunca mexe em policies nem em service_role/postgres", () => {
    assert.doesNotMatch(sql, /cascade/i);
    assert.doesNotMatch(sql, /\b(create|drop|alter)\s+policy\b/i);
    assert.doesNotMatch(sql, /service_role|postgres/i);
  });

  it("não apaga nem altera dados (só comandos de privilégio)", () => {
    assert.doesNotMatch(sql, /\b(delete\s+from|insert\s+into|update\s+public\.|truncate\s+public\.|drop\s+table)\b/i);
  });
});

describe("RLS de sellers (migration já aplicada) — Admin/Master sim, catalog_editor não", () => {
  const rls = sqlCode(SELLERS_RLS);

  it("SELECT, INSERT e UPDATE só para is_admin() (Admin e Master)", () => {
    assert.match(rls, /create policy "sellers_admin_select" on public\.sellers\s+for select\s+using \(is_admin\(\)\)/);
    assert.match(rls, /create policy "sellers_admin_insert" on public\.sellers\s+for insert\s+with check \(is_admin\(\)\)/);
    assert.match(rls, /create policy "sellers_admin_update" on public\.sellers\s+for update\s+using \(is_admin\(\)\)\s+with check \(is_admin\(\)\)/);
  });

  it("nenhuma policy de sellers menciona catalog_editor e não existe policy de DELETE", () => {
    assert.doesNotMatch(rls, /is_catalog_editor_or_admin/);
    assert.doesNotMatch(rls, /catalog_editor/);
    assert.doesNotMatch(rls, /for delete/i);
  });

  it("DELETE segue revogado de anon e authenticated", () => {
    assert.match(rls, /revoke delete on table public\.sellers from anon, authenticated;/);
  });
});

describe("Admin/Master: o código de vendedoras usa a sessão (RLS), não service role", () => {
  const db = read("src/lib/db/sellers.ts");
  const adminFns = [
    "listSellersAdmin",
    "getSellerByIdAdmin",
    "createSeller",
    "renameSeller",
    "updateSellerContact",
    "setSellerActive",
    "reactivateSellerWithWhatsapp",
    "moveSeller",
  ];

  for (const fn of adminFns) {
    it(`${fn} usa createClient (sessão) e não createAdminClient`, () => {
      const body = db.split(new RegExp(`export async function ${fn}\\b`))[1]?.split(/\nexport /)[0] ?? "";
      assert.ok(body.length > 0, `${fn} não encontrado`);
      assert.match(body, /createClient\(\)/);
      assert.doesNotMatch(body, /createAdminClient/);
    });
  }
});

describe("anon nunca toca em sellers no app", () => {
  it("nenhum arquivo que usa o client anon/browser/público lê ou escreve em sellers", () => {
    const anonClientUsers = sourceFiles("src").filter((file) => {
      const source = read(file);
      return /lib\/supabase\/(public|client)"/.test(source);
    });
    for (const file of anonClientUsers) {
      assert.doesNotMatch(read(file), /from\(["']sellers["']\)/, `${file} acessa sellers com client anon`);
    }
  });
});

describe("WhatsApp, round-robin, modal e dashboard seguem com service role", () => {
  it("click-action e favorites-click-action usam createAdminClient e passam o client a resolveSeller", () => {
    for (const file of ["src/lib/whatsapp/click-action.ts", "src/lib/whatsapp/favorites-click-action.ts"]) {
      const source = read(file);
      assert.match(source, /createAdminClient\(\)/, file);
      assert.match(source, /resolveSeller\(supabase, /, file);
    }
  });

  it("resolveSeller continua filtrando active = true (manual e rodízio)", () => {
    const source = read("src/lib/whatsapp/resolve-seller.ts");
    assert.match(source, /\.eq\("active", true\)/);
  });

  it("a lista pública de vendedoras (modal) usa createAdminClient e só ativas", () => {
    const body = read("src/lib/db/sellers.ts").split("export async function getActiveSellersForModal")[1] ?? "";
    assert.match(body, /createAdminClient\(\)/);
    assert.match(body, /\.eq\("active", true\)/);
  });

  it("o dashboard lê sellers com createAdminClient", () => {
    assert.match(read("src/lib/analytics/dashboard.ts"), /createAdminClient\(\)/);
  });
});
