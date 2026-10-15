// Prova REAL (Postgres em WASM, @electric-sql/pglite) de que uma diferença só de
// CAIXA, nos 7 campos que o Zod normaliza para CAIXA ALTA, não conta como mudança:
// não entra em fields_changed, não aparece no audit log, não invalida a conferência
// sozinha — mas o banco grava a versão normalizada de qualquer forma. Aplica as
// migrations 20261016100000 e 20261017100000, nessa ordem, igual rodaria em produção.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const MIGRATION_1 = read("supabase/migrations/20261016100000_fulfillment_intake_admin_edit.sql");
const MIGRATION_2 = read("supabase/migrations/20261017100000_fulfillment_intake_edit_case_insensitive_diff.sql");

const BOOTSTRAP_SQL = `
  create role anon;
  create role authenticated;

  create schema auth;
  create table auth.users (id uuid primary key);
  create or replace function auth.uid() returns uuid
  language sql stable
  as $$ select nullif(current_setting('app.current_user_id', true), '')::uuid $$;

  create type user_role as enum ('admin', 'catalog_editor', 'seller', 'master');
  create table profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    name text not null default 'Teste',
    role user_role not null default 'seller',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create or replace function is_admin()
  returns boolean as $$
    select exists (
      select 1 from profiles where id = auth.uid() and role in ('admin', 'master')
    );
  $$ language sql stable security definer set search_path = public;

  create table fulfillment_intakes (
    id uuid primary key default gen_random_uuid(),
    seller_id uuid,
    sale_date date not null,
    customer_name text not null check (length(trim(customer_name)) > 0),
    customer_whatsapp text check (customer_whatsapp is null or customer_whatsapp ~ '^55[1-9][0-9]9[0-9]{8}$'),
    sale_total numeric(12,2) not null check (sale_total > 0),
    payment_method text not null check (payment_method in ('ITAU_CREDIT_ELO_AMEX','ITAU_CREDIT_MASTER','ITAU_CREDIT_VISA','ITAU_PIX','PIX','CASH','DEBIT_CARD','CREDIT_CARD','CDC','OTHER')),
    sti3_sale_id text,
    internal_notes text,
    status text not null default 'AWAITING_CUSTOMER_DATA' check (status in (
      'AWAITING_CUSTOMER_DATA','DATA_RECEIVED','DOCUMENTS_PENDING','CHECKING',
      'REVIEW_REQUIRED','BLOCKED','APPROVED','CANCELLED'
    )),
    submitted_name text,
    submitted_cpf text,
    submitted_email text,
    submitted_whatsapp text check (submitted_whatsapp is null or submitted_whatsapp ~ '^55[1-9][0-9]9[0-9]{8}$'),
    submitted_delivery_to_customer boolean,
    submitted_recipient_name text,
    submitted_postal_code text,
    submitted_address_line text,
    submitted_address_number text,
    submitted_address_complement text,
    submitted_neighborhood text,
    submitted_city text,
    submitted_state text,
    approved_record_id uuid,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table fulfillment_intake_audit_logs (
    id uuid primary key default gen_random_uuid(),
    intake_id uuid not null,
    action text not null constraint fulfillment_intake_audit_logs_action_check check (action in (
      'INTAKE_CREATED', 'INTAKE_LINK_OPENED', 'INTAKE_DATA_RECEIVED', 'INTAKE_LINK_REOPENED',
      'INTAKE_CHECK_STARTED', 'INTAKE_BLOCKED', 'INTAKE_CHECK_RESTARTED', 'INTAKE_REVIEW_COMPLETED',
      'INTAKE_APPROVED', 'FULFILLMENT_CREATED', 'INTAKE_CANCELLED'
    )),
    actor_id uuid,
    details jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
  );
`;

async function createDb() {
  const db = new PGlite();
  await db.exec(BOOTSTRAP_SQL);
  await db.exec(MIGRATION_1);
  await db.exec(MIGRATION_2);
  return db;
}

let sharedDb: Promise<PGlite> | null = null;
function getSharedDb(): Promise<PGlite> {
  if (!sharedDb) sharedDb = createDb();
  return sharedDb;
}

async function setCurrentUser(db: PGlite, userId: string) {
  await db.query("select set_config('app.current_user_id', $1, false)", [userId]);
}

async function createAdmin(db: PGlite) {
  const id = randomUUID();
  await db.query("insert into auth.users (id) values ($1)", [id]);
  await db.query("insert into profiles (id, name, role) values ($1, 'Teste', 'admin')", [id]);
  return id;
}

/** Réplica do caso real da Arielle: dados "da cliente" em mixed case, como vieram
 * do formulário público antes do fix de CAIXA ALTA. STI3 fixo (não aleatório) para
 * que `patch()` abaixo possa reenviá-lo sem mudar nada — isola o teste no caixa. */
async function createMixedCaseIntake(db: PGlite) {
  const id = randomUUID();
  await db.query(
    `insert into fulfillment_intakes (
       id, sale_date, customer_name, customer_whatsapp, sale_total, payment_method, sti3_sale_id, status,
       submitted_name, submitted_cpf, submitted_email, submitted_whatsapp, submitted_delivery_to_customer,
       submitted_postal_code, submitted_address_line, submitted_address_number, submitted_address_complement,
       submitted_neighborhood, submitted_city, submitted_state
     ) values ($1, '2026-10-14', 'MARIA EXEMPLO', '5567999999999', 33497, 'ITAU_PIX', 'STI3-FIXO', 'BLOCKED',
       'Maria Exemplo', '11144477735', 'maria@exemplo.com', '5567999999999', true,
       '79500000', 'Itapaci', '137', 'Entre as ruas 7 e 9', 'Residencial Granville', 'Goianesia', 'GO')`,
    [id]
  );
  return id;
}

function patch(overrides: Record<string, unknown> = {}) {
  return {
    sti3_sale_id: `STI3-FIXO`,
    customer_name: "MARIA EXEMPLO",
    customer_whatsapp: "5567999999999",
    seller_id: null,
    sale_date: "2026-10-14",
    sale_total: 334.97,
    payment_method: "ITAU_PIX",
    internal_notes: null,
    submitted_name: "MARIA EXEMPLO", // só mudou de caixa (era "Maria Exemplo")
    submitted_cpf: "11144477735",
    submitted_email: "maria@exemplo.com",
    submitted_whatsapp: "5567999999999",
    submitted_delivery_to_customer: true,
    submitted_recipient_name: null,
    submitted_postal_code: "79500000",
    submitted_address_line: "ITAPACI", // só mudou de caixa (era "Itapaci")
    submitted_address_number: "137",
    submitted_address_complement: "ENTRE AS RUAS 7 E 9", // só mudou de caixa
    submitted_neighborhood: "RESIDENCIAL GRANVILLE", // só mudou de caixa
    submitted_city: "GOIANESIA", // só mudou de caixa
    submitted_state: "GO", // já era maiúscula dos dois lados
    ...overrides,
  };
}

async function callEdit(db: PGlite, intakeId: string, p: Record<string, unknown>) {
  return db.query<{ edit_fulfillment_intake: { status: string; fields: string[] } }>(
    "select edit_fulfillment_intake($1, $2, $3, $4) as edit_fulfillment_intake",
    [intakeId, JSON.stringify(p), "SALE_TYPO", null]
  );
}

describe("edit_fulfillment_intake + 20261017100000 (Postgres real): mudança só de caixa não conta", () => {
  it("troca sale_total + mesmos campos da cliente, só em CAIXA ALTA: fields_changed tem APENAS sale_total", async () => {
    const db = await getSharedDb();
    const admin = await createAdmin(db);
    const intakeId = await createMixedCaseIntake(db);
    await setCurrentUser(db, admin);

    const result = await callEdit(db, intakeId, patch());
    assert.deepEqual(result.rows[0].edit_fulfillment_intake.fields, ["sale_total"], "só sale_total realmente mudou — o resto foi só normalização de caixa");

    const audit = await db.query<{ details: { fields: string[] } }>(
      "select details from fulfillment_intake_audit_logs where intake_id = $1 and action = 'INTAKE_EDITED'",
      [intakeId]
    );
    assert.deepEqual(audit.rows[0].details.fields, ["sale_total"]);

    const history = await db.query<{ fields_changed: string[] }>("select fields_changed from fulfillment_intake_edit_history where intake_id = $1", [intakeId]);
    assert.deepEqual(history.rows[0].fields_changed, ["sale_total"]);

  });

  it("mesmo assim, o banco grava a versão em CAIXA ALTA (normalização aplicada, só não conta como 'campo corrigido')", async () => {
    const db = await getSharedDb();
    const admin = await createAdmin(db);
    const intakeId = await createMixedCaseIntake(db);
    await setCurrentUser(db, admin);
    await callEdit(db, intakeId, patch());

    const row = await db.query<{ submitted_name: string; submitted_address_line: string; submitted_address_complement: string }>(
      "select submitted_name, submitted_address_line, submitted_address_complement from fulfillment_intakes where id = $1",
      [intakeId]
    );
    assert.equal(row.rows[0].submitted_name, "MARIA EXEMPLO");
    assert.equal(row.rows[0].submitted_address_line, "ITAPACI");
    assert.equal(row.rows[0].submitted_address_complement, "ENTRE AS RUAS 7 E 9");

  });

  it("sale_total mudando de verdade (não só caixa) continua invalidando a conferência normalmente", async () => {
    const db = await getSharedDb();
    const admin = await createAdmin(db);
    const intakeId = await createMixedCaseIntake(db); // status BLOCKED, sale_total errado (33497)
    await setCurrentUser(db, admin);
    const result = await callEdit(db, intakeId, patch());
    assert.equal(result.rows[0].edit_fulfillment_intake.status, "DATA_RECEIVED");
  });

  it("ISOLADO — mudança só de caixa nos campos CAIXA ALTA NÃO invalida a conferência sozinha: status continua BLOCKED quando só internal_notes (não-conferência) muda de verdade junto", async () => {
    const db = await getSharedDb();
    const admin = await createAdmin(db);
    const id = randomUUID();
    await db.query(
      `insert into fulfillment_intakes (
         id, sale_date, customer_name, customer_whatsapp, sale_total, payment_method, sti3_sale_id, status,
         submitted_name, submitted_cpf, submitted_email, submitted_whatsapp, submitted_delivery_to_customer,
         submitted_postal_code, submitted_address_line, submitted_address_number, submitted_address_complement,
         submitted_neighborhood, submitted_city, submitted_state
       ) values ($1, '2026-10-14', 'MARIA EXEMPLO', '5567999999999', 334.97, 'ITAU_PIX', 'STI3-ISOLADO', 'BLOCKED',
         'Maria Exemplo', '11144477735', 'maria@exemplo.com', '5567999999999', true,
         '79500000', 'Itapaci', '137', 'Entre as ruas 7 e 9', 'Residencial Granville', 'Goianesia', 'GO')`,
      [id]
    );
    await setCurrentUser(db, admin);
    const result = await callEdit(db, id, patch({ sti3_sale_id: "STI3-ISOLADO", internal_notes: "só uma observação nova" }));
    assert.deepEqual(result.rows[0].edit_fulfillment_intake.fields, ["internal_notes"], "só internal_notes mudou de verdade — tudo o mais foi só caixa");
    assert.equal(result.rows[0].edit_fulfillment_intake.status, "BLOCKED", "nenhum campo de conferência mudou de verdade: status não pode ter sido mexido");
  });

  it("isolado: SÓ troca de caixa, sem tocar em sale_total nem em mais nada, é recusada por 'nenhum dado foi alterado' — mudança só de caixa sozinha não é motivo suficiente", async () => {
    const db = await getSharedDb();
    const admin = await createAdmin(db);
    const id = randomUUID();
    await db.query(
      `insert into fulfillment_intakes (
         id, sale_date, customer_name, customer_whatsapp, sale_total, payment_method, sti3_sale_id, status,
         submitted_name, submitted_cpf, submitted_email, submitted_whatsapp, submitted_delivery_to_customer,
         submitted_postal_code, submitted_address_line, submitted_address_number, submitted_address_complement,
         submitted_neighborhood, submitted_city, submitted_state
       ) values ($1, '2026-10-14', 'MARIA EXEMPLO', '5567999999999', 334.97, 'ITAU_PIX', $2, 'DATA_RECEIVED',
         'Maria Exemplo', '11144477735', 'maria@exemplo.com', '5567999999999', true,
         '79500000', 'Itapaci', '137', 'Entre as ruas 7 e 9', 'Residencial Granville', 'Goianesia', 'GO')`,
      [id, `STI3-${id.slice(0, 8)}`]
    );
    await setCurrentUser(db, admin);
    await assert.rejects(
      () => callEdit(db, id, patch({ sti3_sale_id: `STI3-${id.slice(0, 8)}`, sale_total: 334.97 })),
      /nenhum dado foi alterado/
    );
  });

  it("mudança de CONTEÚDO (não só caixa) continua detectada normalmente, mesmo junto com outras em CAIXA ALTA", async () => {
    const db = await getSharedDb();
    const admin = await createAdmin(db);
    const intakeId = await createMixedCaseIntake(db);
    await setCurrentUser(db, admin);
    const result = await callEdit(db, intakeId, patch({ submitted_address_line: "RUA NOVA DE VERDADE" }));
    assert.ok(result.rows[0].edit_fulfillment_intake.fields.includes("sale_total"));
    assert.ok(result.rows[0].edit_fulfillment_intake.fields.includes("submitted_address_line"));
    assert.equal(result.rows[0].edit_fulfillment_intake.fields.length, 2, "nada mais deveria ter 'mudado' além do que realmente mudou");
  });
});
