import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), "utf8").split("\r\n").join("\n");

const ACTIONS = "src/app/admin/faturamento-envios/[id]/post-sale-actions.ts";
const DB = "src/lib/db/post-sale.ts";
const PANEL = "src/app/admin/faturamento-envios/[id]/PostSalePanel.tsx";
const PAGE = "src/app/admin/faturamento-envios/[id]/page.tsx";
const PURE = "src/lib/fulfillment/post-sale.ts";

describe("pós-venda: acesso e nada automático", () => {
  it("a action exige Admin/Master e só grava via planPostSaleEvent", () => {
    const source = read(ACTIONS);
    assert.match(source, /requireAdmin\(\["admin", "master"\]\)/);
    assert.match(source, /planPostSaleEvent\(/);
    assert.doesNotMatch(source, /catalog_editor/);
  });

  it("nenhum arquivo de pós-venda chama API de WhatsApp/envio automático", () => {
    for (const file of [ACTIONS, DB, PANEL, PAGE, PURE]) {
      const source = read(file);
      assert.doesNotMatch(source, /graph\.facebook|sendMessage|send-message|fetch\(\s*["'`]https?:\/\/[^"'`]*whatsapp/i, file);
    }
  });

  it("o link usa api.whatsapp.com/send (nunca wa.me)", () => {
    assert.doesNotMatch(read(PURE), /wa\.me/);
    assert.match(read(PURE), /api\.whatsapp\.com\/send/);
  });

  it("ABRIR só registra depois de OK e abre a janela só então; nunca confirma sozinho", () => {
    const panel = read(PANEL);
    assert.match(panel, /const ok = await run\("opened"\);\s*if \(ok\) window\.open/);
    assert.match(panel, /confirmSent[\s\S]*window\.confirm/);
    assert.doesNotMatch(panel, /run\("confirmed"\)[^;]*\n[^}]*openWhatsapp/);
  });
});

describe("pós-venda: auditoria sem dados sensíveis", () => {
  it("o insert grava details vazio e só action/record/ator", () => {
    const source = read(DB);
    const insert = source.slice(source.indexOf(".insert({"), source.indexOf("});", source.indexOf(".insert({")));
    assert.match(insert, /details: \{\}/);
    assert.doesNotMatch(insert, /phone|telefone|cpf|address|endereco|message|text/i);
    assert.match(insert, /record_id: input\.recordId/);
    assert.match(insert, /actor_id: input\.actorId/);
  });

  it("a leitura da trilha não seleciona colunas sensíveis", () => {
    const source = read(DB);
    const select = source.match(/\.select\("([^"]+)"\)/)?.[1] ?? "";
    assert.equal(select, "action, created_at, actor_id");
  });
});

describe("pós-venda: migration proposta", () => {
  const migration = read("supabase/migrations/20261005220000_fulfillment_post_sale_audit_actions.sql");

  it("só amplia a lista de ações da auditoria, sem tocar em dados", () => {
    assert.match(migration, /drop constraint if exists fulfillment_audit_logs_action_check/);
    assert.match(migration, /'TRACKING_WHATSAPP_OPENED'/);
    assert.match(migration, /'GOOGLE_REVIEW_CONFIRMED'/);
    assert.doesNotMatch(migration, /\b(delete|truncate|update|insert)\b/i);
  });

  it("a migration proposta mantém as ações antigas", () => {
    for (const a of ["CREATED", "DOCUMENT_VIEWED", "DELIVERY_UPDATED"]) assert.match(migration, new RegExp(`'${a}'`));
  });
});
