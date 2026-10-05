import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { sellerContactSchema, sellerNameSchema, sellerSchema } from "../../validation/seller.ts";
import {
  cleanSellerName,
  describeNameConflict,
  findNameConflict,
  normalizeSellerName,
  selectableSellers,
  sellerNameMap,
  type SellerLike,
} from "../management.ts";

const ROOT = process.cwd();
const readSource = (path: string) => readFileSync(join(ROOT, path), "utf8").split("\r\n").join("\n");
const read = readSource;

function allSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, entry);
    const stat = statSync(join(ROOT, rel));
    if (stat.isDirectory()) out.push(...allSourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(entry) && !rel.includes("__tests__")) out.push(rel);
  }
  return out;
}

const bruniani: SellerLike = { id: "11111111-1111-4111-8111-111111111111", name: "Bruniani", active: true };
const camila: SellerLike = { id: "22222222-2222-4222-8222-222222222222", name: "Camila", active: true };
const exFuncionaria: SellerLike = { id: "33333333-3333-4333-8333-333333333333", name: "Maria Abadia", active: false };

describe("nomes", () => {
  it("normaliza caixa, acento e espaços só para comparar", () => {
    assert.equal(normalizeSellerName("  Brúniani   "), "bruniani");
    assert.equal(cleanSellerName("  Ana   Paula "), "Ana Paula");
  });

  it("EDITAR NOME: aceita a correção (Bruniane → Bruniani), recusa vazio e nome gigante", () => {
    assert.equal(sellerNameSchema.parse({ name: "  Bruniani " }).name, "Bruniani");
    assert.equal(sellerNameSchema.safeParse({ name: "   " }).success, false);
    assert.equal(sellerNameSchema.safeParse({ name: "x".repeat(81) }).success, false);
  });

  it("não deixa renomear/criar com o nome de OUTRA vendedora (ativa ou inativa)", () => {
    const all = [bruniani, camila, exFuncionaria];
    assert.equal(findNameConflict("camila", all)?.id, camila.id);
    assert.equal(findNameConflict("MARIA ABADIA", all)?.id, exFuncionaria.id);
    assert.match(describeNameConflict(exFuncionaria), /REATIVAR/);
    assert.match(describeNameConflict(camila), /ativa/);
  });

  it("a própria vendedora não conflita consigo mesma ao corrigir o nome", () => {
    assert.equal(findNameConflict("Bruniani", [bruniani, camila], bruniani.id), null);
    assert.equal(findNameConflict("Nome Novo", [bruniani, camila]), null);
  });
});

describe("schemas", () => {
  it("NOVA VENDEDORA exige nome e WhatsApp válido", () => {
    const ok = sellerSchema.parse({ name: "Ana", whatsapp_number: "+55 (67) 99999-9999", phone: "", active: true, round_robin: true });
    assert.equal(ok.whatsapp_number, "5567999999999");
    assert.equal(ok.phone, null);
    assert.equal(sellerSchema.safeParse({ name: "Ana", whatsapp_number: "123", phone: "", active: true, round_robin: true }).success, false);
  });

  it("CONTATO nunca carrega nome nem ativa/inativa", () => {
    const parsed = sellerContactSchema.parse({
      whatsapp_number: "5567999999999",
      phone: "",
      round_robin: true,
      name: "Outra Pessoa",
      active: false,
    } as Record<string, unknown>);
    assert.deepEqual(Object.keys(parsed).sort(), ["phone", "round_robin", "whatsapp_number"]);
  });
});

describe("ativas × inativas", () => {
  it("só as ATIVAS podem ser escolhidas para uma nova venda", () => {
    const options = selectableSellers([bruniani, { ...camila, active: false }, exFuncionaria]);
    assert.deepEqual(options.map((s) => s.name), ["Bruniani"]);
  });

  it("DESATIVAR a Bruniani: some das escolhas, mas o histórico continua mostrando o nome dela", () => {
    const desativada = { ...bruniani, active: false };
    const all = [desativada, camila];
    assert.equal(selectableSellers(all).some((s) => s.id === bruniani.id), false);
    // pedidos antigos continuam ligados ao MESMO seller_id → nome exibido normalmente
    assert.equal(sellerNameMap(all)[bruniani.id], "Bruniani");
  });

  it("REATIVAR volta a aparecer nas escolhas, com o mesmo id", () => {
    const reativada = { ...bruniani, active: true };
    assert.equal(selectableSellers([reativada]).length, 1);
    assert.equal(reativada.id, bruniani.id);
  });

  it("corrigir o nome não troca o vínculo: o id é o mesmo", () => {
    const renomeada = { ...bruniani, name: "Bruniani Silva" };
    assert.equal(renomeada.id, bruniani.id);
    assert.equal(sellerNameMap([renomeada])[bruniani.id], "Bruniani Silva");
  });
});

// ── Verificações estáticas do código: o que NÃO pode existir ───────────────────────────────

describe("não existe DELETE de vendedora", () => {
  it("nenhum arquivo do app apaga linhas de sellers", () => {
    for (const file of allSourceFiles("src")) {
      const source = readSource(file);
      assert.doesNotMatch(source, /from\(["']sellers["']\)\s*\.delete\(/, `${file} apaga sellers`);
      assert.doesNotMatch(source, /from\(["']sellers["']\)[\s\S]{0,120}\.delete\(/, `${file} apaga sellers`);
    }
  });

  it("db/sellers.ts e as actions não exportam nada de excluir/remover", () => {
    for (const file of ["src/lib/db/sellers.ts", "src/app/admin/vendedoras/actions.ts"]) {
      const names = [...read(file).matchAll(/export (?:async )?function (\w+)/g)].map((m) => m[1]);
      assert.ok(names.length > 0);
      for (const name of names) assert.doesNotMatch(name, /delete|remove|destroy|apagar|excluir/i, `${file}: ${name}`);
    }
  });

  it("NOVA VENDEDORA nunca informa id (o banco gera um novo; nunca se reaproveita)", () => {
    const create = read("src/lib/db/sellers.ts").match(/export async function createSeller[\s\S]*?\n}\n/)?.[0] ?? "";
    assert.ok(create.includes(".insert("));
    assert.doesNotMatch(create, /\bid\s*:/);
    assert.doesNotMatch(create, /\.upsert\(/);
  });

  it("EDITAR NOME só atualiza o nome; DESATIVAR/REATIVAR só o active", () => {
    const db = read("src/lib/db/sellers.ts");
    assert.match(db, /\.update\(\{ name \}\)/);
    assert.match(db, /\.update\(\{ active \}\)/);
    const contact = db.match(/export async function updateSellerContact[\s\S]*?\n}\n/)?.[0] ?? "";
    assert.doesNotMatch(contact, /name|active/);
  });
});

describe("somente Admin/Master", () => {
  it("toda action de vendedoras exige admin/master (catalog_editor e seller fora)", () => {
    const source = read("src/app/admin/vendedoras/actions.ts");
    assert.match(source, /const ALLOWED_ROLES = \["admin", "master"\] as const;/);
    // Toda chamada a requireAdmin usa a lista fixa — nenhuma lista própria (que poderia incluir outro papel).
    const calls = source.match(/requireAdmin\(/g) ?? [];
    const fixedCalls = source.match(/requireAdmin\(\[\.\.\.ALLOWED_ROLES\]\)/g) ?? [];
    assert.equal(calls.length, fixedCalls.length);
    const bodies = source.split(/export async function /).slice(1);
    assert.ok(bodies.length >= 5);
    for (const body of bodies) assert.match(body, /await requireAdmin\(\[\.\.\.ALLOWED_ROLES\]\)/, body.slice(0, 40));
  });

  it("todas as páginas de vendedoras e o item do menu são Admin/Master", () => {
    for (const file of ["page.tsx", "nova/page.tsx", "[id]/page.tsx"]) {
      assert.match(read(`src/app/admin/vendedoras/${file}`), /requireAdmin\(\["admin", "master"\]\)/, file);
    }
    assert.match(read("src/app/admin/AdminNav.tsx"), /label: "Vendedoras"[^}]*adminOnly: true/);
  });
});

describe("WhatsApp e round-robin só usam vendedoras ATIVAS (nada a alterar)", () => {
  it("resolveSeller: escolha manual e rodízio filtram active = true", () => {
    const source = read("src/lib/whatsapp/resolve-seller.ts");
    assert.equal((source.match(/\.eq\("active", true\)/g) ?? []).length, 2);
    assert.match(source, /\.eq\("round_robin", true\)/);
  });

  it("a lista do modal público filtra active = true", () => {
    const db = read("src/lib/db/sellers.ts");
    const modal = db.match(/export async function getActiveSellersForModal[\s\S]*?\n}\n/)?.[0] ?? "";
    assert.match(modal, /\.eq\("active", true\)/);
  });
});

describe("Faturamento e Envios", () => {
  it("o select de nova venda só recebe vendedoras ativas e o servidor recusa inativa", () => {
    assert.match(read("src/app/admin/faturamento-envios/novo/page.tsx"), /selectableSellers\(await listSellersAdmin\(\)\)/);
    assert.match(read("src/app/admin/faturamento-envios/novo/actions.ts"), /!\(await isActiveSeller\(parsed\.data\.seller_id\)\)/);
  });

  it("histórico: nomes (listagem, filtro e detalhe) NÃO filtram por active", () => {
    const fulfillment = read("src/lib/db/fulfillment.ts");
    const getName = fulfillment.match(/export async function getSellerName[\s\S]*?\n}\n/)?.[0] ?? "";
    assert.doesNotMatch(getName, /active/);
    const options = fulfillment.match(/export async function getFulfillmentFilterOptions[\s\S]*?\n}\n/)?.[0] ?? "";
    assert.match(options, /listSellersAdmin\(\)/);
    assert.doesNotMatch(options, /active.*true/);
  });
});
