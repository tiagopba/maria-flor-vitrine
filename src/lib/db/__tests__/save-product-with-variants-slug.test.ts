import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { slugify } from "../../utils.ts";

/**
 * Cobertura de integração (SQL real, não reimplementado em TS) para o bug
 * "Este endereço já está sendo usado por outra peça." ao cadastrar produto
 * com nome repetido ou usar Duplicar — ver
 * supabase/migrations/20261019090000_save_product_with_variants_unique_slug.sql.
 *
 * `save_product_with_variants` é PL/pgSQL (SECURITY DEFINER): não existe
 * forma de testar sua lógica de verdade sem um Postgres real. Este arquivo
 * sobe um Postgres em WASM (@electric-sql/pglite, em memória, descartado ao
 * final), replica só o subconjunto mínimo do schema real de que a function
 * depende e executa O ARQUIVO DA MIGRATION de verdade (lido do disco) — não
 * uma cópia colada aqui, pra nunca testar uma versão que diverge do que
 * seria de fato aplicado. Nenhum produto real, Preview ou Production é
 * tocado: o banco inteiro é descartado a cada execução deste arquivo.
 */

const MIGRATION_PATH = fileURLToPath(
  new URL("../../../../supabase/migrations/20261019090000_save_product_with_variants_unique_slug.sql", import.meta.url)
);

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const COLOR_AZUL_ID = "22222222-2222-4222-8222-222222222222";

let db: PGlite;

async function save(payload: unknown): Promise<{
  group_id: string | null;
  variants: { id: string; client_key: string; slug: string; internal_code: string }[];
  removed_image_paths: string[];
}> {
  const result = await db.query<{ save_product_with_variants: unknown }>(
    "select public.save_product_with_variants($1::jsonb) as save_product_with_variants",
    [JSON.stringify(payload)]
  );
  return result.rows[0].save_product_with_variants as never;
}

/** Erro controlado da RPC: código estável antes do primeiro ":" — mesmo parsing de src/lib/db/product-variants.ts. */
function errorCode(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return message.split(":")[0].trim();
}

function newProductPayload(input: { name: string; slug: string; colorId?: string | null }) {
  return {
    root_product_id: null,
    removed_variant_ids: [],
    shared: {
      name: input.name,
      description: null,
      category_id: CATEGORY_ID,
      price: 199.9,
      promotional_price: null,
      cash_price: null,
      max_installments_override: null,
    },
    variants: [
      {
        id: null,
        client_key: "client-key-1",
        color_id: input.colorId ?? null,
        status: "ACTIVE",
        featured: false,
        slug: input.slug,
        sizes: ["P", "M"],
        images: [],
      },
    ],
  };
}

function editSlugPayload(input: { productId: string; name: string; slug: string }) {
  return {
    root_product_id: input.productId,
    removed_variant_ids: [],
    shared: {
      name: input.name,
      description: null,
      category_id: CATEGORY_ID,
      price: 199.9,
      promotional_price: null,
      cash_price: null,
      max_installments_override: null,
    },
    variants: [
      {
        id: input.productId,
        client_key: "client-key-1",
        color_id: null,
        status: "ACTIVE",
        featured: false,
        slug: input.slug,
        sizes: ["P", "M"],
        images: [],
      },
    ],
  };
}

before(async () => {
  db = new PGlite();

  // Roles mínimas que a migration de verdade referencia em revoke/grant.
  await db.exec("create role anon; create role authenticated;");

  // Subconjunto mínimo do schema real de que save_product_with_variants
  // depende (formato final das colunas, não a história completa de
  // migrations — não é preciso replicar 30 arquivos pra testar esta RPC).
  await db.exec(`
    create type public.product_status as enum (
      'ACTIVE', 'LAST_UNITS', 'CHECK_AVAILABILITY', 'SOLD_OUT', 'ARCHIVED'
    );

    create table public.categories (
      id uuid primary key default gen_random_uuid(),
      name text not null
    );

    create table public.colors (
      id uuid primary key default gen_random_uuid(),
      name text not null
    );

    create table public.product_groups (
      id uuid primary key default gen_random_uuid(),
      name text null,
      created_at timestamptz not null default now()
    );

    create table public.products (
      id uuid primary key default gen_random_uuid(),
      code text not null unique,
      name text not null,
      slug text not null unique,
      description text,
      price numeric(10,2) not null check (price >= 0),
      promotional_price numeric(10,2) check (promotional_price is null or promotional_price >= 0),
      cash_price numeric(10,2) null check (cash_price is null or cash_price >= 0),
      max_installments_override integer null check (max_installments_override is null or max_installments_override > 0),
      category_id uuid not null references public.categories(id) on delete restrict,
      status public.product_status not null default 'ACTIVE',
      featured boolean not null default false,
      color_id uuid null references public.colors(id) on delete set null,
      product_group_id uuid null references public.product_groups(id) on delete set null,
      published_at timestamptz,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      archived_at timestamptz,
      internal_code bigint not null generated by default as identity,
      constraint promotional_price_lower_than_price check (promotional_price is null or promotional_price < price),
      constraint cash_price_lte_price check (cash_price is null or cash_price <= price),
      constraint cash_price_excludes_promotional_price check (cash_price is null or promotional_price is null),
      constraint products_internal_code_key unique (internal_code)
    );

    create table public.product_images (
      id uuid primary key default gen_random_uuid(),
      product_id uuid not null references public.products(id) on delete cascade,
      storage_path text not null,
      position int not null default 0,
      created_at timestamptz not null default now()
    );

    create table public.product_sizes (
      id uuid primary key default gen_random_uuid(),
      product_id uuid not null references public.products(id) on delete cascade,
      size text not null,
      position int not null default 0,
      created_at timestamptz not null default now(),
      unique (product_id, size)
    );

    create table public.product_slug_redirects (
      id uuid primary key default gen_random_uuid(),
      product_id uuid not null references public.products(id) on delete cascade,
      old_slug text not null unique,
      created_at timestamptz not null default now()
    );

    -- Stub: a RPC só precisa que esta função exista e devolva true — a
    -- sessão real (is_admin()/papel/RLS) não é o que este arquivo audita.
    create function public.is_catalog_editor_or_admin() returns boolean
      language sql as $$ select true $$;

    create table public.categories_seed_marker (id int); -- no-op, mantém o bloco com ; final
  `);

  await db.query("insert into public.categories (id, name) values ($1, 'Vestidos')", [CATEGORY_ID]);
  await db.query("insert into public.colors (id, name) values ($1, 'Azul')", [COLOR_AZUL_ID]);

  // Executa o ARQUIVO DA MIGRATION real (create or replace function +
  // revoke/grant) — nunca uma cópia da lógica reescrita aqui.
  const migrationSql = readFileSync(MIGRATION_PATH, "utf8");
  await db.exec(migrationSql);
});

after(async () => {
  await db.close();
});

beforeEach(async () => {
  // Isola cada teste: limpa dados E reinicia a sequence de internal_code,
  // pra cada teste poder prever exatamente o sufixo esperado (1, 2, 3...).
  await db.exec(`
    truncate table
      public.product_slug_redirects,
      public.product_images,
      public.product_sizes,
      public.products,
      public.product_groups
    restart identity cascade;
  `);
});

describe("save_product_with_variants — slug único para produto novo (migration 20261019090000)", () => {
  it("1) cria produto com nome inédito — slug fica só nome+cor, sem sufixo", async () => {
    const result = await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));
    assert.equal(result.variants[0].slug, "vestido-tule");
    assert.equal(result.variants[0].internal_code, "00000001");
  });

  it("2) segundo produto com o MESMO nome recebe um slug diferente, automaticamente", async () => {
    const first = await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));
    const second = await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));

    assert.equal(first.variants[0].slug, "vestido-tule");
    assert.equal(second.variants[0].slug, "vestido-tule-00000002");
    assert.notEqual(first.variants[0].id, second.variants[0].id);
  });

  it("3) terceiro produto com o mesmo nome também recebe slug próprio — todos distintos", async () => {
    const r1 = await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));
    const r2 = await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));
    const r3 = await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));

    const slugs = [r1, r2, r3].map((r) => r.variants[0].slug);
    assert.equal(new Set(slugs).size, 3, `esperava 3 slugs distintos, recebeu ${JSON.stringify(slugs)}`);
    assert.deepEqual(slugs, ["vestido-tule", "vestido-tule-00000002", "vestido-tule-00000003"]);
  });

  it("4) Duplicar produto (mesmo nome, sem copiar id/code/slug) nunca colide com o original", async () => {
    const original = await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));

    // Fluxo Duplicar (admin/produtos/novo/page.tsx): novo cadastro, nome
    // igual, root_product_id null, slug recomputado do zero (nunca o slug
    // do original) — exatamente o que computeSlug(ProductForm) envia.
    const duplicated = await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));

    assert.equal(original.variants[0].slug, "vestido-tule");
    assert.equal(duplicated.variants[0].slug, "vestido-tule-00000002");
    assert.notEqual(duplicated.variants[0].id, original.variants[0].id);
    assert.notEqual(duplicated.variants[0].internal_code, original.variants[0].internal_code);

    // O original não foi tocado pela duplicação.
    const row = await db.query<{ slug: string }>("select slug from public.products where id = $1", [original.variants[0].id]);
    assert.equal(row.rows[0].slug, "vestido-tule");
  });

  it("5) Duplicar um produto cujo nome já tem várias ocorrências gera uma 4ª peça com slug próprio", async () => {
    const a = await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));
    const b = await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));
    const c = await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));
    // "Duplicar" a própria C (ou qualquer uma — o fluxo nunca distingue):
    const duplicatedFromC = await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));

    const allSlugs = [a, b, c, duplicatedFromC].map((r) => r.variants[0].slug);
    assert.equal(new Set(allSlugs).size, 4, `esperava 4 slugs distintos, recebeu ${JSON.stringify(allSlugs)}`);
  });

  it("6) todos os slugs gerados são únicos no banco (constraint + lógica de sufixo concordam)", async () => {
    for (let i = 0; i < 5; i++) {
      await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));
    }
    const rows = await db.query<{ slug: string }>("select slug from public.products order by internal_code");
    const slugs = rows.rows.map((r) => r.slug);
    assert.equal(new Set(slugs).size, slugs.length);
    assert.deepEqual(slugs, [
      "vestido-tule",
      "vestido-tule-00000002",
      "vestido-tule-00000003",
      "vestido-tule-00000004",
      "vestido-tule-00000005",
    ]);
  });

  it("7) nomes idênticos são permitidos — a coluna `name` não precisa ser única", async () => {
    await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));
    await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));
    await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));

    const rows = await db.query<{ name: string }>("select name from public.products");
    assert.equal(rows.rows.length, 3);
    for (const row of rows.rows) assert.equal(row.name, "Vestido Tule");
  });

  it("8) cada produto novo recebe um internal_code diferente, mesmo com nome/slug colidindo", async () => {
    const r1 = await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));
    const r2 = await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));
    const r3 = await save(newProductPayload({ name: "Vestido Tule", slug: slugify("Vestido Tule") }));

    const codes = [r1, r2, r3].map((r) => r.variants[0].internal_code);
    assert.deepEqual(codes, ["00000001", "00000002", "00000003"]);
  });

  it("9) editar o slug de um produto já existente para um já usado continua bloqueando (nunca sufixa sozinho)", async () => {
    const a = await save(newProductPayload({ name: "Vestido Tule", slug: "vestido-tule" }));
    const b = await save(newProductPayload({ name: "Saia Longa", slug: "saia-longa" }));
    assert.equal(a.variants[0].slug, "vestido-tule");

    await assert.rejects(
      () => save(editSlugPayload({ productId: b.variants[0].id, name: "Saia Longa", slug: "vestido-tule" })),
      (err: unknown) => errorCode(err) === "slug_taken"
    );

    // Nem A nem B tiveram o slug alterado pela tentativa rejeitada.
    const rows = await db.query<{ id: string; slug: string }>("select id, slug from public.products order by internal_code");
    assert.deepEqual(
      rows.rows.map((r) => r.slug),
      ["vestido-tule", "saia-longa"]
    );
  });

  it("10) a UNIQUE constraint do banco continua sendo a proteção real contra duplicidade, mesmo por fora da RPC", async () => {
    await save(newProductPayload({ name: "Vestido Tule", slug: "vestido-tule" }));

    // Mesmo um INSERT direto (fora da RPC, simulando qualquer outro caminho
    // de escrita) não consegue burlar a unicidade do slug — é a constraint
    // do banco, não só a checagem em PL/pgSQL, que garante isso.
    await assert.rejects(
      () =>
        db.query(
          "insert into public.products (code, name, slug, price, category_id, internal_code) values ('99999999', 'Outro Nome', 'vestido-tule', 10, $1, 999)",
          [CATEGORY_ID]
        ),
      (err: unknown) => (err as { code?: string }).code === "23505"
    );

    // E o caminho defensivo da própria RPC (seção "produto novo"): se, por
    // hipótese, o slug COM sufixo também já existisse (produto manual
    // antigo com esse padrão exato), a function nunca sobrescreve — rejeita
    // com um erro próprio, nunca salva dado incoerente.
    await db.query(
      "insert into public.products (code, name, slug, price, category_id, internal_code) values ('99999998', 'Pré-existente', 'vestido-tule-00000002', 10, $1, 998)",
      [CATEGORY_ID]
    );
    await assert.rejects(
      () => save(newProductPayload({ name: "Vestido Tule", slug: "vestido-tule" })),
      (err: unknown) => errorCode(err) === "slug_suffix_collision"
    );
  });
});
