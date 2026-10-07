import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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

  it("popup: a aba é aberta DENTRO do clique (antes de qualquer await) e só recebe o link após o OPENED", () => {
    const panel = read(PANEL);
    const openAt = panel.indexOf("window.open(\"\", \"_blank\")");
    const awaitAt = panel.indexOf("await registerPostSaleEvent(recordId, item.kind, \"opened\")");
    assert.ok(openAt > 0 && awaitAt > openAt, "window.open tem de vir antes do await");
    assert.match(panel, /if \(!result\.ok\) \{\s*win\.close\(\);/);
    assert.match(panel, /win\.location\.href = item\.url!/);
  });

  it("nunca confirma sozinho: só o botão CONFIRMAR QUE ENVIEI abre a confirmação, e ABRIR/REENVIAR nunca chama confirmSent", () => {
    const panel = read(PANEL);
    assert.match(panel, /onClick={\(\) => setConfirming\(true\)}/, "CONFIRMAR QUE ENVIEI só abre a confirmação inline");
    assert.match(panel, /onConfirm={confirmSent}/, "só o botão CONFIRMAR ENVIO da confirmação inline chama confirmSent");
    const openWhatsappBody = panel.slice(panel.indexOf("const openWhatsapp ="), panel.indexOf("const confirmSent ="));
    assert.doesNotMatch(openWhatsappBody, /confirmSent\(/, "abrir/reenviar nunca confirma por conta própria");
    assert.doesNotMatch(openWhatsappBody, /"confirmed"/, "abrir/reenviar nunca grava a fase confirmed");
  });

  it("a confirmação exige uma ação explícita em dois passos (abrir a confirmação, depois CONFIRMAR ENVIO)", () => {
    const panel = read(PANEL);
    assert.match(panel, /\{confirming && \(/);
    assert.match(panel, /Confirma que esta mensagem foi realmente enviada/);
  });
});

describe("pós-venda: SENT é um estado durável, não um efeito de copiar/abrir", () => {
  const DB_SOURCE = () => read(DB);

  it("confirmFollowupSent escreve em fulfillment_followups — nunca em fulfillment_audit_logs", () => {
    const fn = DB_SOURCE().slice(DB_SOURCE().indexOf("export async function confirmFollowupSent"));
    assert.match(fn, /\.from\("fulfillment_followups"\)/);
    assert.doesNotMatch(fn, /fulfillment_audit_logs/);
  });

  it("a confirmação é condicional (status ainda OPEN): double submit não duplica nem sobrescreve", () => {
    const fn = DB_SOURCE().slice(DB_SOURCE().indexOf("export async function confirmFollowupSent"));
    assert.match(fn, /\.eq\("status", "OPEN"\)/);
    assert.match(fn, /written: true/);
    assert.match(fn, /written: false/);
  });

  it("a action nunca manda o texto da mensagem para insertPostSaleAudit (fica só em message_snapshot)", () => {
    const source = read(ACTIONS);
    const insertCall = source.slice(source.indexOf("insertPostSaleAudit({"), source.indexOf("});", source.indexOf("insertPostSaleAudit({")));
    assert.doesNotMatch(insertCall, /message/i);
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

describe("WhatsApp do cliente: privado, fora da auditoria e de analytics", () => {
  const WA_ACTION = "src/app/admin/faturamento-envios/[id]/customer-whatsapp-actions.ts";
  const WA_PANEL = "src/app/admin/faturamento-envios/[id]/CustomerWhatsappPanel.tsx";
  const WA_DB = "src/lib/db/customer-whatsapp.ts";

  it("a action de edição exige Admin/Master e audita só o nome do campo", () => {
    const source = read(WA_ACTION);
    assert.match(source, /requireAdmin\(\["admin", "master"\]\)/);
    assert.match(source, /details: \{ changed_fields: \["customer_whatsapp"\] \}/);
    assert.doesNotMatch(source, /details:[^}]*parsed\.value/);
  });

  it("o número nunca entra em details de auditoria, em nenhum arquivo", () => {
    for (const file of [WA_ACTION, WA_DB, WA_PANEL, PAGE, PANEL, DB]) {
      const source = read(file);
      const audit = source.match(/details:[^\n]*/g) ?? [];
      for (const line of audit) assert.doesNotMatch(line, /parsed|value|phone|raw|telefone/, file);
    }
  });

  it("o WhatsApp não aparece em analytics, Pixel/CAPI nem localStorage", () => {
    for (const file of [WA_ACTION, WA_DB, WA_PANEL, PAGE, PANEL, PURE]) {
      assert.doesNotMatch(read(file), /localStorage|sessionStorage/, file);
    }
    for (const dir of ["src/lib/analytics", "src/lib/capi", "src/lib/pixel"]) {
      try {
        for (const f of readdirSync(join(ROOT, dir))) {
          assert.doesNotMatch(read(join(dir, f)), /customer_whatsapp/, f);
        }
      } catch {
        // pasta inexistente: nada a verificar
      }
    }
  });

  it("migration proposta: coluna opcional e formato 55+DDD+9 (sem alterar registros)", () => {
    const migration = read("supabase/migrations/20261005230000_fulfillment_customer_whatsapp.sql");
    assert.match(migration, /add column if not exists customer_whatsapp text/);
    assert.match(migration, /customer_whatsapp is null or customer_whatsapp ~ '\^55\[1-9\]\[0-9\]9\[0-9\]\{8\}\$'/);
    assert.doesNotMatch(migration, /\b(delete|truncate|update|insert)\b/i);
  });
});
