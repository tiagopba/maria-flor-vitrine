import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

/**
 * Cobertura de integração (SQL real, não reimplementado em TS) da Fase 3 do
 * módulo "cliente por CPF + avaliação global": vínculo automático de cliente
 * (trigger) e a RPC atômica de confirmar/bloquear pedido de avaliação.
 *
 * Mesmo princípio de save-product-with-variants-slug.test.ts: sobe um
 * Postgres em WASM (@electric-sql/pglite, em memória, descartado ao final),
 * replica só o SUBCONJUNTO MÍNIMO do schema real de que estas migrations
 * dependem, e executa os ARQUIVOS DAS MIGRATIONS de verdade (lidos do
 * disco) — nunca uma cópia colada aqui. `is_admin()`/`auth.uid()` são stubs
 * (a sessão/RLS real não é o que este arquivo audita — isso já é garantido
 * pela mesma função is_admin() usada em todo o resto do módulo).
 */

const MIGRATIONS_DIR = fileURLToPath(new URL("../../../../supabase/migrations/", import.meta.url));
const CUSTOMERS_MIGRATION = readFileSync(`${MIGRATIONS_DIR}20261116100000_fulfillment_customers.sql`, "utf8");
const REVIEW_STATUS_MIGRATION = readFileSync(`${MIGRATIONS_DIR}20261116110000_fulfillment_customer_review_status.sql`, "utf8");
const BACKEND_MIGRATION = readFileSync(`${MIGRATIONS_DIR}20261116120000_fulfillment_customer_review_backend.sql`, "utf8");

const ACTOR_ID = "11111111-1111-4111-8111-111111111111";

let db: PGlite;

async function insertRecord(input: {
  id: string;
  cpf: string | null;
  name: string;
  saleDate?: string;
}): Promise<void> {
  await db.query(
    `insert into public.fulfillment_records
       (id, customer_name, customer_cpf, customer_name_search, sale_date, record_source, danfe_file_path, label_file_path)
     values ($1, $2, $3, '', coalesce($4, current_date), 'PDF_UPLOAD', 'x', 'y')`,
    [input.id, input.name, input.cpf, input.saleDate ?? null]
  );
}

async function createOpenFollowup(recordId: string, type: "SHIPPING_NOTICE" | "DELIVERY_CONFIRMATION" | "GOOGLE_REVIEW" = "GOOGLE_REVIEW") {
  await db.query(
    `insert into public.fulfillment_followups (record_id, type) values ($1, $2) on conflict (record_id, type) do nothing`,
    [recordId, type]
  );
}

async function customerIdFor(recordId: string): Promise<string | null> {
  const r = await db.query<{ customer_id: string | null }>("select customer_id from public.fulfillment_records where id = $1", [recordId]);
  return r.rows[0]?.customer_id ?? null;
}

async function reviewStatusFor(customerId: string): Promise<string | null> {
  const r = await db.query<{ status: string }>("select status from public.customer_review_status where customer_id = $1", [customerId]);
  return r.rows[0]?.status ?? null;
}

// CPFs matematicamente válidos, gerados pelo mesmo algoritmo de src/lib/intake/cpf.ts
// (não reimplementado aqui — só valores fixos conferidos uma vez).
const CPF_A = "52998224725";
const CPF_B = "11144477735";

before(async () => {
  db = new PGlite();

  await db.exec("create role anon; create role authenticated;");
  await db.exec("create schema auth;");
  await db.exec(`create function auth.uid() returns uuid language sql stable as $$ select '${ACTOR_ID}'::uuid $$;`);

  // Stub: true por padrão — os testes de permissão trocam por false e
  // revertem depois. A sessão/RLS real não é o que este arquivo audita.
  await db.exec(`create or replace function public.is_admin() returns boolean language sql stable as $$ select true $$;`);

  await db.exec(`
    create or replace function public.set_updated_at() returns trigger
    language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;

    create table public.profiles (
      id uuid primary key,
      name text not null default 'Teste'
    );

    -- Subconjunto mínimo de fulfillment_records (só o que as migrations desta
    -- fase tocam) — sem as constraints de documentos/pagamento/import, que
    -- não fazem parte do que está sendo testado aqui.
    create table public.fulfillment_records (
      id uuid primary key default gen_random_uuid(),
      customer_name text not null,
      customer_cpf text,
      customer_name_search text not null default '',
      sale_date date not null,
      delivery_status text not null default 'PENDING',
      status text not null default 'CONFIRMED',
      record_source text not null,
      danfe_file_path text,
      label_file_path text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create trigger fulfillment_records_set_updated_at before update on public.fulfillment_records
      for each row execute function public.set_updated_at();

    create table public.fulfillment_followups (
      id uuid primary key default gen_random_uuid(),
      record_id uuid not null references public.fulfillment_records(id) on delete cascade,
      type text not null check (type in ('SHIPPING_NOTICE', 'DELIVERY_CONFIRMATION', 'GOOGLE_REVIEW')),
      status text not null default 'OPEN' check (status in ('OPEN', 'SENT')),
      sent_at timestamptz,
      sent_by uuid references public.profiles(id) on delete set null,
      message_snapshot text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (record_id, type)
    );
  `);

  await db.query("insert into public.profiles (id) values ($1)", [ACTOR_ID]);

  // Arquivos REAIS das migrations — não reimplementados.
  await db.exec(CUSTOMERS_MIGRATION);
  await db.exec(REVIEW_STATUS_MIGRATION);
  await db.exec(BACKEND_MIGRATION);
});

after(async () => {
  await db.close();
});

beforeEach(async () => {
  await db.exec(`
    truncate table
      public.customer_review_events,
      public.customer_review_status,
      public.fulfillment_followups,
      public.fulfillment_records,
      public.customers
    restart identity cascade;
  `);
});

describe("Cenário 1 — primeira compra de cliente nova", () => {
  it("cria o customer e vincula customer_id na venda", async () => {
    await insertRecord({ id: "00000000-0000-4000-8000-000000000001", cpf: CPF_A, name: "Maria Silva" });
    const customerId = await customerIdFor("00000000-0000-4000-8000-000000000001");
    assert.ok(customerId);

    const customer = await db.query<{ cpf_digits: string; display_name: string }>("select cpf_digits, display_name from public.customers where id = $1", [customerId]);
    assert.equal(customer.rows[0].cpf_digits, CPF_A);
    assert.equal(customer.rows[0].display_name, "Maria Silva");

    assert.equal(await reviewStatusFor(customerId!), "NEVER_ASKED");
  });
});

describe("Cenário 2 — nova compra de cliente recorrente", () => {
  it("reaproveita o MESMO customer_id, nunca cria um segundo customer, nunca reescreve o nome", async () => {
    await insertRecord({ id: "00000000-0000-4000-8000-000000000001", cpf: CPF_A, name: "Maria Silva" });
    await insertRecord({ id: "00000000-0000-4000-8000-000000000002", cpf: CPF_A, name: "MARIA DA SILVA (grafia diferente)" });

    const id1 = await customerIdFor("00000000-0000-4000-8000-000000000001");
    const id2 = await customerIdFor("00000000-0000-4000-8000-000000000002");
    assert.equal(id1, id2);

    const count = await db.query<{ count: string }>("select count(*)::int as count from public.customers");
    assert.equal(count.rows[0].count, 1);

    // Nome não é atualizado indiscriminadamente pela 2ª venda.
    const customer = await db.query<{ display_name: string }>("select display_name from public.customers where id = $1", [id1]);
    assert.equal(customer.rows[0].display_name, "Maria Silva");
  });
});

describe("Cenário 5 — cliente sem CPF válido", () => {
  it("sem CPF: customer_id fica null, nenhum customer é criado", async () => {
    await insertRecord({ id: "00000000-0000-4000-8000-000000000003", cpf: null, name: "Sem CPF" });
    assert.equal(await customerIdFor("00000000-0000-4000-8000-000000000003"), null);
  });

  it("CPF só formato-válido (dígito verificador errado): mesmo tratamento — customer_id null", async () => {
    await insertRecord({ id: "00000000-0000-4000-8000-000000000004", cpf: "11111111111", name: "CPF inválido" });
    assert.equal(await customerIdFor("00000000-0000-4000-8000-000000000004"), null);
    const count = await db.query<{ count: string }>("select count(*)::int as count from public.customers");
    assert.equal(count.rows[0].count, 0);
  });
});

describe("Cenário 9 — compatibilidade entre caminhos de criação de venda", () => {
  it("o trigger não distingue quem inseriu — qualquer insert em fulfillment_records aciona a mesma regra", async () => {
    // Simula um 2º "caminho" (ex.: approve_fulfillment_intake) só com um
    // insert direto, exatamente como a RPC real faz — o trigger é quem
    // decide, nunca o caller.
    await db.query(
      `insert into public.fulfillment_records (id, customer_name, customer_cpf, sale_date, record_source, danfe_file_path, label_file_path)
       values ($1, $2, $3, current_date, 'XML_UPLOAD', null, null)`,
      ["00000000-0000-4000-8000-000000000005", "Cliente via Intake", CPF_B]
    );
    assert.ok(await customerIdFor("00000000-0000-4000-8000-000000000005"));
  });
});

describe("Cenário 8 — follow-ups antigos preservados", () => {
  it("criar uma venda nova não mexe nos follow-ups de uma venda anterior", async () => {
    await insertRecord({ id: "00000000-0000-4000-8000-000000000006", cpf: CPF_A, name: "Cliente" });
    await createOpenFollowup("00000000-0000-4000-8000-000000000006");
    await db.query("update public.fulfillment_followups set status='SENT', sent_at=now(), sent_by=$1 where record_id=$2", [
      ACTOR_ID,
      "00000000-0000-4000-8000-000000000006",
    ]);

    await insertRecord({ id: "00000000-0000-4000-8000-000000000007", cpf: CPF_A, name: "Cliente" });
    await createOpenFollowup("00000000-0000-4000-8000-000000000007");

    const old = await db.query<{ status: string }>("select status from public.fulfillment_followups where record_id=$1", [
      "00000000-0000-4000-8000-000000000006",
    ]);
    assert.equal(old.rows[0].status, "SENT");
  });
});

describe("Cenários 3/4 — bloqueio por estado global da cliente", () => {
  async function setup(status: string) {
    await insertRecord({ id: "00000000-0000-4000-8000-0000000000a1", cpf: CPF_A, name: "Cliente" });
    const customerId = await customerIdFor("00000000-0000-4000-8000-0000000000a1");
    await db.query("update public.customer_review_status set status=$1 where customer_id=$2", [status, customerId]);

    // Venda NOVA da mesma cliente (mesmo CPF) — é nela que tentamos pedir avaliação.
    await insertRecord({ id: "00000000-0000-4000-8000-0000000000a2", cpf: CPF_A, name: "Cliente" });
    await createOpenFollowup("00000000-0000-4000-8000-0000000000a2");
    return customerId!;
  }

  it("REQUESTED bloqueia novo pedido", async () => {
    await setup("REQUESTED");
    await assert.rejects(() => db.query("select public.confirm_google_review_sent($1, 'msg')", ["00000000-0000-4000-8000-0000000000a2"]));
  });

  it("REVIEWED bloqueia novo pedido", async () => {
    await setup("REVIEWED");
    await assert.rejects(() => db.query("select public.confirm_google_review_sent($1, 'msg')", ["00000000-0000-4000-8000-0000000000a2"]));
  });

  it("DOES_NOT_WANT bloqueia novo pedido", async () => {
    await setup("DOES_NOT_WANT");
    await assert.rejects(() => db.query("select public.confirm_google_review_sent($1, 'msg')", ["00000000-0000-4000-8000-0000000000a2"]));
  });

  it("NEVER_ASKED permite", async () => {
    const customerId = await setup("NEVER_ASKED");
    await db.query("select public.confirm_google_review_sent($1, 'msg')", ["00000000-0000-4000-8000-0000000000a2"]);
    assert.equal(await reviewStatusFor(customerId), "REQUESTED");
  });

  it("DISMISSED é reversível — permite pedir de novo numa venda futura", async () => {
    const customerId = await setup("DISMISSED");
    await db.query("select public.confirm_google_review_sent($1, 'msg')", ["00000000-0000-4000-8000-0000000000a2"]);
    assert.equal(await reviewStatusFor(customerId), "REQUESTED");
  });
});

describe("Cenário 7 — duas tentativas de solicitar avaliação", () => {
  it("clique duplicado na MESMA venda é idempotente (written=false), nunca duplica evento", async () => {
    await insertRecord({ id: "00000000-0000-4000-8000-0000000000b1", cpf: CPF_A, name: "Cliente" });
    await createOpenFollowup("00000000-0000-4000-8000-0000000000b1");

    const first = await db.query<{ confirm_google_review_sent: { written: boolean } }>(
      "select public.confirm_google_review_sent($1, 'msg') as confirm_google_review_sent",
      ["00000000-0000-4000-8000-0000000000b1"]
    );
    assert.equal(first.rows[0].confirm_google_review_sent.written, true);

    const second = await db.query<{ confirm_google_review_sent: { written: boolean } }>(
      "select public.confirm_google_review_sent($1, 'msg') as confirm_google_review_sent",
      ["00000000-0000-4000-8000-0000000000b1"]
    );
    assert.equal(second.rows[0].confirm_google_review_sent.written, false);

    const customerId = await customerIdFor("00000000-0000-4000-8000-0000000000b1");
    const events = await db.query<{ count: number }>("select count(*)::int as count from public.customer_review_events where customer_id=$1", [customerId]);
    assert.equal(events.rows[0].count, 1);
  });

  it("2ª tentativa numa venda DIFERENTE da mesma cliente, depois da 1ª já ter marcado REQUESTED, é rejeitada — prova a trava global", async () => {
    await insertRecord({ id: "00000000-0000-4000-8000-0000000000b2", cpf: CPF_A, name: "Cliente" });
    await createOpenFollowup("00000000-0000-4000-8000-0000000000b2");
    await insertRecord({ id: "00000000-0000-4000-8000-0000000000b3", cpf: CPF_A, name: "Cliente" });
    await createOpenFollowup("00000000-0000-4000-8000-0000000000b3");

    await db.query("select public.confirm_google_review_sent($1, 'msg')", ["00000000-0000-4000-8000-0000000000b2"]);
    await assert.rejects(() => db.query("select public.confirm_google_review_sent($1, 'msg')", ["00000000-0000-4000-8000-0000000000b3"]));
  });
});

describe("set_customer_review_outcome — ação humana explícita", () => {
  it("marca REVIEWED e registra o evento", async () => {
    await insertRecord({ id: "00000000-0000-4000-8000-0000000000c1", cpf: CPF_A, name: "Cliente" });
    const customerId = await customerIdFor("00000000-0000-4000-8000-0000000000c1");

    await db.query("select public.set_customer_review_outcome($1, 'REVIEWED', null)", [customerId]);
    assert.equal(await reviewStatusFor(customerId!), "REVIEWED");

    const events = await db.query<{ action: string }>("select action from public.customer_review_events where customer_id=$1", [customerId]);
    assert.equal(events.rows[0].action, "REVIEWED");
  });

  it("rejeita um resultado fora da lista fechada", async () => {
    await insertRecord({ id: "00000000-0000-4000-8000-0000000000c2", cpf: CPF_A, name: "Cliente" });
    const customerId = await customerIdFor("00000000-0000-4000-8000-0000000000c2");
    await assert.rejects(() => db.query("select public.set_customer_review_outcome($1, 'INVALIDO', null)", [customerId]));
  });
});

describe("Permissão — nunca só a tela decide", () => {
  it("confirm_google_review_sent recusa quando is_admin() é false", async () => {
    await insertRecord({ id: "00000000-0000-4000-8000-0000000000d1", cpf: CPF_A, name: "Cliente" });
    await createOpenFollowup("00000000-0000-4000-8000-0000000000d1");

    await db.exec(`create or replace function public.is_admin() returns boolean language sql stable as $$ select false $$;`);
    try {
      await assert.rejects(() => db.query("select public.confirm_google_review_sent($1, 'msg')", ["00000000-0000-4000-8000-0000000000d1"]));
    } finally {
      await db.exec(`create or replace function public.is_admin() returns boolean language sql stable as $$ select true $$;`);
    }
  });
});
