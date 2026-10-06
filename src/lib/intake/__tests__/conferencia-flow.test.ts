import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const CONF = "src/app/admin/faturamento-envios/pre/[id]/conferencia-actions.ts";
const SQL = "supabase/migrations/20261005240000_fulfillment_intakes.sql";
const DB = "src/lib/db/intakes.ts";

describe("tentativas: recomeçar gera nova tentativa e nada é apagado", () => {
  it("cada envio cria tentativa = última + 1 (nunca reutiliza número)", () => {
    const src = code(CONF);
    assert.match(src, /const attemptNo = \(previous\[0\]\?\.attempt_no \?\? 0\) \+ 1;/);
    assert.match(src, /intakes\/\$\{intakeId\}\/attempt-\$\{attemptNo\}\//);
  });

  it("o histórico de tentativas não é apagado pelo app", () => {
    for (const f of [CONF, DB]) {
      assert.doesNotMatch(code(f), /fulfillment_verification_attempts"\)\s*\.delete|\.delete\(\)[\s\S]*?verification/, f);
    }
    assert.doesNotMatch(read(SQL), /delete from public\.fulfillment_verification_attempts/i);
  });

  it("o resultado antigo nunca libera: a conferência é recalculada do zero (conferir é chamado a cada envio)", () => {
    const src = code(CONF);
    assert.match(src, /const outcome: ConfereOutcome = conferir\(/);
  });
});

describe("aprovação: só a tentativa válida atual, sem BLOCKED, sem bypass", () => {
  const sql = read(SQL);

  it("o banco recusa tentativa que não é a mais recente", () => {
    assert.match(sql, /if v_latest is null or p_attempt <> v_latest then/);
  });

  it("o banco recusa BLOCKED e REVIEW sem todos os avisos revisados", () => {
    assert.match(sql, /if v_att\.verdict = 'BLOCKED' then/);
    assert.match(sql, /not \(v_att\.review_fields <@ v_att\.reviewed_fields\)/);
  });

  it("só aprova a partir de CHECKING ou REVIEW_REQUIRED (estado da conferência)", () => {
    assert.match(sql, /if v_intake\.status not in \('CHECKING', 'REVIEW_REQUIRED'\) then/);
  });

  it("aprovação é travada (FOR UPDATE) e idempotente: clique duplo devolve o mesmo registro", () => {
    assert.match(sql, /select \* into v_intake from fulfillment_intakes where id = p_intake for update;/);
    assert.match(sql, /if v_intake\.status = 'APPROVED' and v_intake\.approved_record_id is not null then\s*return v_intake\.approved_record_id;/);
  });

  it("só Admin/Master (is_admin) e a função não é executável por anon/public", () => {
    assert.match(sql, /if not is_admin\(\) then/);
    assert.match(sql, /revoke all on function public\.approve_fulfillment_intake\(uuid, integer, jsonb\) from public, anon;/);
  });

  it("a action de aprovação checa o gate antes de chamar o banco", () => {
    const src = code(CONF);
    assert.match(src, /canApprove\(/);
    assert.match(src, /if \(!gate\.ok\) return \{ ok: false, error: gate\.error \};/);
  });
});

describe("registro aprovado: entra com PENDING e preserva pagamento", () => {
  const sql = read(SQL);

  it("o registro definitivo nasce com delivery_status PENDING e status CONFIRMED", () => {
    assert.match(sql, /v_intake\.sale_date, v_intake\.seller_id, null, 'PENDING', 'CONFIRMED',/);
  });

  it("sale_total, payment_method e installments são copiados da solicitação", () => {
    assert.match(sql, /v_intake\.sale_total, v_intake\.payment_method, v_intake\.installments, v_actor/);
  });

  it("os PDFs do registro são os da tentativa aprovada (paths reais, nunca inventados)", () => {
    assert.match(read(CONF), /danfe_file_path: attempt\.danfe_file_path/);
    assert.match(read(CONF), /label_file_path: attempt\.label_file_path/);
  });
});

describe("auditoria da conferência: sem PII", () => {
  it("os eventos de conferência só carregam número da tentativa, veredito e nomes de campo", () => {
    const src = code(CONF);
    const details = src.match(/details: \{[^}]*\}/g) ?? [];
    assert.ok(details.length >= 4);
    for (const d of details) assert.doesNotMatch(d, /submitted|cpf:|address|value|phone|whatsapp|text|pdf/i, d);
  });

  it("nenhum arquivo da conferência usa localStorage/sessionStorage/Pixel/CAPI", () => {
    for (const f of [CONF, "src/app/admin/faturamento-envios/pre/[id]/ConferenciaPanel.tsx"]) {
      assert.doesNotMatch(code(f), /localStorage|sessionStorage|MetaPixel|CAPI/, f);
    }
  });

  it("a página de detalhe exige Admin/Master antes de mostrar dados e conferência", () => {
    assert.match(read("src/app/admin/faturamento-envios/pre/[id]/page.tsx"), /await requireAdmin\(\["admin", "master"\]\);/);
  });
});

describe("pós-venda continua bloqueado antes da aprovação", () => {
  it("o pós-venda só existe sobre fulfillment_records: a conferência não cria registro antes da aprovação", () => {
    const src = code(CONF);
    assert.doesNotMatch(src, /from\("fulfillment_records"\)\s*\.insert/);
    assert.match(read(SQL), /insert into fulfillment_records \(/);
  });
});
