// Prova REAL (Postgres de verdade, em WASM — @electric-sql/pglite, sem Docker) de que
// edit_fulfillment_intake é atômica: UPDATE + audit log + histórico privado numa só
// transação. Diferente do resto da suíte (que só lê o texto das migrations), este
// arquivo executa a migration 20261016100000 de verdade contra um banco isolado,
// com stubs mínimos de auth.uid()/is_admin()/profiles — o mesmo padrão descrito em
// PROJECT_STATUS.md (seção 11) como "Postgres em WASM com stubs do Supabase",
// antes só rodado como script temporário fora do repositório; agora comitado porque
// o requisito pedido ("provocar falha deliberada... confirmar que a intake NÃO foi
// alterada") só pode ser provado de verdade com um banco, não com leitura de texto.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const MIGRATION = readFileSync(join(ROOT, "supabase/migrations/20261016100000_fulfillment_intake_admin_edit.sql"), "utf8");

// ── Schema mínimo: só o que edit_fulfillment_intake toca ou depende. ──────────
const BOOTSTRAP_SQL = `
  create role anon;
  create role authenticated;

  create schema auth;
  create table auth.users (id uuid primary key);
  -- Stub de auth.uid(): lê uma GUC de sessão em vez do JWT real do Supabase.
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

  -- Definição idêntica à de supabase/migrations/20260902100100_master_role_rls_functions.sql.
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
  // A migration real, executada tal como está no arquivo (nada reescrito aqui):
  // adiciona INTAKE_EDITED ao audit log, cria fulfillment_intake_edit_history,
  // cria edit_fulfillment_intake, aplica os grants.
  await db.exec(MIGRATION);
  return db;
}

/**
 * Criar um Postgres em WASM do zero (schema + migration) custa alguns segundos —
 * caro demais para repetir em cada teste. Os testes que só LEEM o resultado de
 * uma chamada (sem derrubar tabela nem depender de estado global) compartilham
 * UMA instância (cada um cria sua própria intake/profile com UUID novo, então
 * não há interferência entre eles). Só o teste que **derruba uma tabela de
 * propósito** (a prova de atomicidade) usa uma instância própria, descartável.
 */
let sharedDb: Promise<PGlite> | null = null;
function getSharedDb(): Promise<PGlite> {
  if (!sharedDb) sharedDb = createDb();
  return sharedDb;
}

async function setCurrentUser(db: PGlite, userId: string | null) {
  await db.query("select set_config('app.current_user_id', $1, false)", [userId ?? ""]);
}

async function createProfile(db: PGlite, role: "admin" | "master" | "seller" | "catalog_editor") {
  const id = randomUUID();
  await db.query("insert into auth.users (id) values ($1)", [id]);
  await db.query("insert into profiles (id, name, role) values ($1, 'Teste', $2)", [id, role]);
  return id;
}

async function createIntake(db: PGlite, overrides: Partial<{ status: string; sale_total: number }> = {}) {
  const id = randomUUID();
  await db.query(
    `insert into fulfillment_intakes (
       id, sale_date, customer_name, customer_whatsapp, sale_total, payment_method, sti3_sale_id, status,
       submitted_name, submitted_cpf, submitted_email, submitted_whatsapp, submitted_delivery_to_customer,
       submitted_postal_code, submitted_address_line, submitted_address_number, submitted_neighborhood,
       submitted_city, submitted_state
     ) values ($1, '2026-10-15', 'MARIA EXEMPLO', '5567999999999', $2, 'ITAU_PIX', $3, $4,
       'MARIA EXEMPLO', '11144477735', 'maria@exemplo.com', '5567999999999', true,
       '79500000', 'RUA EXEMPLO', '100', 'JARDIM EXEMPLO', 'CIDADE EXEMPLO', 'MS')`,
    [id, overrides.sale_total ?? 334.97, `STI3-${id.slice(0, 8)}`, overrides.status ?? "BLOCKED"]
  );
  return id;
}

function basePatch(overrides: Record<string, unknown> = {}) {
  return {
    sti3_sale_id: "STI3-EDITADO",
    customer_name: "MARIA EXEMPLO EDITADA",
    customer_whatsapp: "5567999999999",
    seller_id: null,
    sale_date: "2026-10-15",
    sale_total: 334.97,
    payment_method: "ITAU_PIX",
    internal_notes: null,
    ...overrides,
  };
}

function patchWithCustomerFields(overrides: Record<string, unknown> = {}) {
  return basePatch({
    submitted_name: "MARIA EXEMPLO",
    submitted_cpf: "11144477735",
    submitted_email: "maria@exemplo.com",
    submitted_whatsapp: "5567999999999",
    submitted_delivery_to_customer: true,
    submitted_recipient_name: null,
    submitted_postal_code: "79500000",
    submitted_address_line: "RUA ITAPACI",
    submitted_address_number: "137",
    submitted_address_complement: null,
    submitted_neighborhood: "JARDIM EXEMPLO",
    submitted_city: "CIDADE EXEMPLO",
    submitted_state: "MS",
    ...overrides,
  });
}

async function callEdit(db: PGlite, intakeId: string, patch: Record<string, unknown>, reasonCode = "SALE_TYPO", reasonNote: string | null = null) {
  return db.query<{ edit_fulfillment_intake: { status: string; fields: string[] } }>(
    "select edit_fulfillment_intake($1, $2, $3, $4) as edit_fulfillment_intake",
    [intakeId, JSON.stringify(patch), reasonCode, reasonNote]
  );
}

describe("edit_fulfillment_intake (Postgres real via pglite): atomicidade", () => {
  it("falha deliberada no histórico privado (tabela ausente) não deixa NADA salvo — nem o UPDATE, nem o audit log", async () => {
    const db = await createDb();
    const admin = await createProfile(db, "admin");
    const intakeId = await createIntake(db, { status: "BLOCKED" });

    const before = await db.query<{ submitted_address_line: string; status: string }>(
      "select submitted_address_line, status from fulfillment_intakes where id = $1",
      [intakeId]
    );

    // Falha deliberada: a tabela de histórico "desaparece" depois que a migration já
    // rodou (reproduz exatamente o cenário real do teste em Preview: INSERT que falha
    // depois do UPDATE já ter sido calculado pela função).
    await db.exec("drop table fulfillment_intake_edit_history;");

    await setCurrentUser(db, admin);
    await assert.rejects(() => callEdit(db, intakeId, patchWithCustomerFields({ submitted_address_line: "RUA NOVA" })));

    const after = await db.query<{ submitted_address_line: string; status: string }>(
      "select submitted_address_line, status from fulfillment_intakes where id = $1",
      [intakeId]
    );
    assert.deepEqual(after.rows[0], before.rows[0], "a intake não pode ter mudado: o UPDATE precisa ter sido desfeito junto com a falha do histórico");

    const auditCount = await db.query<{ count: string }>(
      "select count(*)::text as count from fulfillment_intake_audit_logs where intake_id = $1 and action = 'INTAKE_EDITED'",
      [intakeId]
    );
    assert.equal(auditCount.rows[0].count, "0", "nenhum audit log pode ter sido gravado: o INSERT dele também precisa ter sido desfeito");

    await db.close();
  });

  it("caminho feliz: UPDATE + audit log + histórico privado são gravados juntos", async () => {
    const db = await getSharedDb();
    const admin = await createProfile(db, "admin");
    const intakeId = await createIntake(db, { status: "BLOCKED" });
    await setCurrentUser(db, admin);

    // Patch igual ao que já está salvo, exceto o único campo sob teste — isola o
    // diff para poder afirmar exatamente ["submitted_address_line"] mais abaixo.
    const current = await db.query<Record<string, unknown>>("select * from fulfillment_intakes where id = $1", [intakeId]);
    const row = current.rows[0];
    const unchangedPatch = patchWithCustomerFields({
      sti3_sale_id: row.sti3_sale_id,
      customer_name: row.customer_name,
      customer_whatsapp: row.customer_whatsapp,
      sale_date: "2026-10-15",
      sale_total: Number(row.sale_total),
      payment_method: row.payment_method,
      internal_notes: row.internal_notes,
      submitted_name: row.submitted_name,
      submitted_cpf: row.submitted_cpf,
      submitted_email: row.submitted_email,
      submitted_whatsapp: row.submitted_whatsapp,
      submitted_delivery_to_customer: row.submitted_delivery_to_customer,
      submitted_recipient_name: row.submitted_recipient_name,
      submitted_postal_code: row.submitted_postal_code,
      submitted_address_line: "RUA NOVA",
      submitted_address_number: row.submitted_address_number,
      submitted_address_complement: row.submitted_address_complement,
      submitted_neighborhood: row.submitted_neighborhood,
      submitted_city: row.submitted_city,
      submitted_state: row.submitted_state,
    });

    const result = await callEdit(db, intakeId, unchangedPatch, "NFE_ISSUANCE_CORRECTION", null);
    assert.equal(result.rows[0].edit_fulfillment_intake.status, "DATA_RECEIVED");
    assert.ok(result.rows[0].edit_fulfillment_intake.fields.includes("submitted_address_line"));

    const after = await db.query<{ submitted_address_line: string; status: string }>(
      "select submitted_address_line, status from fulfillment_intakes where id = $1",
      [intakeId]
    );
    assert.equal(after.rows[0].submitted_address_line, "RUA NOVA");
    assert.equal(after.rows[0].status, "DATA_RECEIVED");

    const audit = await db.query<{ details: Record<string, unknown> }>(
      "select details from fulfillment_intake_audit_logs where intake_id = $1 and action = 'INTAKE_EDITED'",
      [intakeId]
    );
    assert.equal(audit.rows.length, 1);
    assert.deepEqual((audit.rows[0].details as { fields: string[] }).fields.sort(), ["submitted_address_line"]);

    const history = await db.query<{ reason_code: string; reason_note: string | null; conference_invalidated: boolean }>(
      "select reason_code, reason_note, conference_invalidated from fulfillment_intake_edit_history where intake_id = $1",
      [intakeId]
    );
    assert.equal(history.rows.length, 1);
    assert.equal(history.rows[0].reason_code, "NFE_ISSUANCE_CORRECTION");
    assert.equal(history.rows[0].reason_note, null);
    assert.equal(history.rows[0].conference_invalidated, true);

  });
});

describe("edit_fulfillment_intake (Postgres real via pglite): permissão", () => {
  it("ADMIN edita com sucesso", async () => {
    const db = await getSharedDb();
    const admin = await createProfile(db, "admin");
    const intakeId = await createIntake(db, { status: "DATA_RECEIVED" });
    await setCurrentUser(db, admin);
    await assert.doesNotReject(() => callEdit(db, intakeId, basePatch({ internal_notes: "corrigido" })));
  });

  it("MASTER edita com sucesso", async () => {
    const db = await getSharedDb();
    const master = await createProfile(db, "master");
    const intakeId = await createIntake(db, { status: "DATA_RECEIVED" });
    await setCurrentUser(db, master);
    await assert.doesNotReject(() => callEdit(db, intakeId, basePatch({ internal_notes: "corrigido" })));
  });

  it("usuário sem permissão (seller/operador) não edita, mesmo chamando a função diretamente (não só pela tela)", async () => {
    const db = await getSharedDb();
    const seller = await createProfile(db, "seller");
    const intakeId = await createIntake(db, { status: "DATA_RECEIVED" });

    const before = await db.query<{ internal_notes: string | null }>("select internal_notes from fulfillment_intakes where id = $1", [intakeId]);

    await setCurrentUser(db, seller);
    await assert.rejects(() => callEdit(db, intakeId, basePatch({ internal_notes: "tentativa indevida" })), /sem permiss(ã|a)o/);

    const after = await db.query<{ internal_notes: string | null }>("select internal_notes from fulfillment_intakes where id = $1", [intakeId]);
    assert.deepEqual(after.rows[0], before.rows[0]);

  });

  it("sem sessão nenhuma (auth.uid() nulo) também é recusado", async () => {
    const db = await getSharedDb();
    const intakeId = await createIntake(db, { status: "DATA_RECEIVED" });
    await setCurrentUser(db, null);
    await assert.rejects(() => callEdit(db, intakeId, basePatch()), /sem permiss(ã|a)o/);
  });
});

describe("edit_fulfillment_intake (Postgres real via pglite): motivo 'Outro'", () => {
  it("'Outro' sem nota é recusado pelo banco (defesa real, não só na tela)", async () => {
    const db = await getSharedDb();
    const admin = await createProfile(db, "admin");
    const intakeId = await createIntake(db, { status: "DATA_RECEIVED" });
    await setCurrentUser(db, admin);
    await assert.rejects(() => callEdit(db, intakeId, basePatch({ internal_notes: "x" }), "OTHER", null));
  });

  it("'Outro' com nota é persistido no histórico privado", async () => {
    const db = await getSharedDb();
    const admin = await createProfile(db, "admin");
    const intakeId = await createIntake(db, { status: "DATA_RECEIVED" });
    await setCurrentUser(db, admin);
    await callEdit(db, intakeId, basePatch({ internal_notes: "x" }), "OTHER", "Cliente ligou pedindo correção do CEP.");

    const history = await db.query<{ reason_note: string | null }>("select reason_note from fulfillment_intake_edit_history where intake_id = $1", [intakeId]);
    assert.equal(history.rows[0].reason_note, "Cliente ligou pedindo correção do CEP.");
  });

  it("audit log genérico NÃO contém a nota de 'Outro' (só fields/reason/conferenceInvalidated)", async () => {
    const db = await getSharedDb();
    const admin = await createProfile(db, "admin");
    const intakeId = await createIntake(db, { status: "DATA_RECEIVED" });
    await setCurrentUser(db, admin);
    await callEdit(db, intakeId, basePatch({ internal_notes: "x" }), "OTHER", "Texto que não pode vazar para o audit log genérico.");

    const audit = await db.query<{ details: Record<string, unknown> }>(
      "select details from fulfillment_intake_audit_logs where intake_id = $1 and action = 'INTAKE_EDITED'",
      [intakeId]
    );
    const serialized = JSON.stringify(audit.rows[0].details);
    assert.doesNotMatch(serialized, /não pode vazar/);
    assert.deepEqual(Object.keys(audit.rows[0].details).sort(), ["conferenceInvalidated", "fields", "reason"]);
  });
});

describe("edit_fulfillment_intake (Postgres real via pglite): invalidação da conferência", () => {
  it("campo de conferência alterado volta o status para DATA_RECEIVED quando já havia tentativa (BLOCKED)", async () => {
    const db = await getSharedDb();
    const admin = await createProfile(db, "admin");
    const intakeId = await createIntake(db, { status: "BLOCKED" });
    await setCurrentUser(db, admin);
    const result = await callEdit(db, intakeId, patchWithCustomerFields({ submitted_address_line: "RUA CORRIGIDA" }));
    assert.equal(result.rows[0].edit_fulfillment_intake.status, "DATA_RECEIVED");
  });

  it("campo que NÃO participa da conferência nunca muda o status, mesmo em BLOCKED", async () => {
    const db = await getSharedDb();
    const admin = await createProfile(db, "admin");
    const intakeId = await createIntake(db, { status: "BLOCKED" });
    await setCurrentUser(db, admin);
    const result = await callEdit(db, intakeId, basePatch({ internal_notes: "só observação" }));
    assert.equal(result.rows[0].edit_fulfillment_intake.status, "BLOCKED");
  });

  it("GREEN/BLOCKED antigo não pode ser usado para aprovação depois da edição: status já não é mais CHECKING/REVIEW_REQUIRED", async () => {
    const db = await getSharedDb();
    const admin = await createProfile(db, "admin");
    const intakeId = await createIntake(db, { status: "CHECKING" }); // simula GREEN aprovável
    await setCurrentUser(db, admin);
    await callEdit(db, intakeId, patchWithCustomerFields({ submitted_address_line: "RUA MUDOU" }));

    const row = await db.query<{ status: string }>("select status from fulfillment_intakes where id = $1", [intakeId]);
    assert.notEqual(row.rows[0].status, "CHECKING");
    assert.notEqual(row.rows[0].status, "REVIEW_REQUIRED");
    assert.equal(row.rows[0].status, "DATA_RECEIVED", "precisa de um novo envio do XML antes de poder aprovar de novo");
  });

  it("recusa editar intake já APPROVED ou CANCELLED (nem admin consegue)", async () => {
    const db = await getSharedDb();
    const admin = await createProfile(db, "admin");
    const approved = await createIntake(db, { status: "APPROVED" });
    const cancelled = await createIntake(db, { status: "CANCELLED" });
    await setCurrentUser(db, admin);
    await assert.rejects(() => callEdit(db, approved, basePatch({ internal_notes: "x" })), /aprovada ou cancelada/);
    await assert.rejects(() => callEdit(db, cancelled, basePatch({ internal_notes: "x" })), /aprovada ou cancelada/);
  });
});

describe("edit_fulfillment_intake (Postgres real via pglite): whitelist do patch", () => {
  it("chave fora da whitelist é REJEITADA, não ignorada em silêncio — mesmo tentando mudar status direto", async () => {
    const db = await getSharedDb();
    const admin = await createProfile(db, "admin");
    const intakeId = await createIntake(db, { status: "BLOCKED" });
    await setCurrentUser(db, admin);

    const before = await db.query<{ status: string }>("select status from fulfillment_intakes where id = $1", [intakeId]);
    await assert.rejects(
      () => callEdit(db, intakeId, { ...basePatch(), status: "APPROVED" }),
      /campo não permitido/
    );
    const after = await db.query<{ status: string }>("select status from fulfillment_intakes where id = $1", [intakeId]);
    assert.equal(after.rows[0].status, before.rows[0].status, "status não pode ter mudado: a chamada inteira precisa ter sido recusada");
  });

  it("tentar passar id, approved_record_id ou token_hash no patch é recusado", async () => {
    const db = await getSharedDb();
    const admin = await createProfile(db, "admin");
    const intakeId = await createIntake(db, { status: "DATA_RECEIVED" });
    await setCurrentUser(db, admin);

    for (const extra of [{ id: randomUUID() }, { approved_record_id: randomUUID() }, { token_hash: "x" }, { cancelled_at: new Date().toISOString() }]) {
      await assert.rejects(() => callEdit(db, intakeId, { ...basePatch(), ...extra }), /campo não permitido/);
    }
  });

  it("falta de um campo obrigatório da venda (os 8) é recusada", async () => {
    const db = await getSharedDb();
    const admin = await createProfile(db, "admin");
    const intakeId = await createIntake(db, { status: "DATA_RECEIVED" });
    await setCurrentUser(db, admin);

    const incomplete = basePatch();
    delete (incomplete as Record<string, unknown>).internal_notes;
    await assert.rejects(() => callEdit(db, intakeId, incomplete), /campo obrigatório ausente/);
  });

  it("dados da cliente pela metade (alguns dos 13, não todos) são recusados — nunca aplicados parcialmente", async () => {
    const db = await getSharedDb();
    const admin = await createProfile(db, "admin");
    const intakeId = await createIntake(db, { status: "DATA_RECEIVED" });
    await setCurrentUser(db, admin);

    const partial = { ...basePatch(), submitted_cpf: "11144477735", submitted_name: "MARIA EXEMPLO" };
    await assert.rejects(() => callEdit(db, intakeId, partial), /dados da cliente incompletos/);
  });

  it("patch só com os 8 campos da venda (sem nenhum dado da cliente) continua funcionando normalmente", async () => {
    const db = await getSharedDb();
    const admin = await createProfile(db, "admin");
    const intakeId = await createIntake(db, { status: "DATA_RECEIVED" });
    await setCurrentUser(db, admin);
    await assert.doesNotReject(() => callEdit(db, intakeId, basePatch({ internal_notes: "só a venda, sem tocar na cliente" })));
  });
});
