import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { CANCEL_NOTE_MAX, CANCEL_REASON_LABELS, validateCancelInput } from "../cancel.ts";
import { formatCep, isValidCep, normalizeCep } from "../cep.ts";
import { groupIntakeRows, INTAKE_GROUPS } from "../groups.ts";
import { publicSubmitSchema } from "../schema.ts";
import {
  canApproveIntake,
  canCancelIntake,
  canCustomerSubmit,
  canReopenCollection,
  canUploadDocuments,
  INTAKE_STATUS_LABELS,
  INTAKE_STATUSES,
  isIntakeLinkUsable,
  type IntakeStatus,
} from "../status.ts";

const ROOT = join(import.meta.dirname, "..", "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const MIGRATION = read("supabase/migrations/20261006120000_fulfillment_intake_cancellation.sql");
const UUID = "11111111-2222-4333-8444-555555555555";
const OPEN: IntakeStatus[] = ["AWAITING_CUSTOMER_DATA", "DATA_RECEIVED", "DOCUMENTS_PENDING", "CHECKING", "REVIEW_REQUIRED", "BLOCKED"];

describe("cancelamento: quando é permitido", () => {
  it("venda válida (ainda sem aprovação) pode ser cancelada, em qualquer estado aberto", () => {
    for (const s of OPEN) assert.equal(canCancelIntake(s, null), true, s);
  });

  it("fulfillment já aprovado não usa este cancelamento (status APPROVED ou record criado)", () => {
    assert.equal(canCancelIntake("APPROVED", null), false);
    assert.equal(canCancelIntake("APPROVED", UUID), false);
    assert.equal(canCancelIntake("CHECKING", UUID), false, "record criado mesmo sem status APPROVED");
  });

  it("cancelada não pode ser cancelada de novo", () => {
    assert.equal(canCancelIntake("CANCELLED", null), false);
  });
});

describe("cancelamento: efeitos sobre o fluxo", () => {
  it("cancelada não reabre a coleta", () => {
    assert.equal(canReopenCollection("CANCELLED"), false);
  });

  it("cancelada não recebe DANFE/etiqueta nem inicia conferência", () => {
    assert.equal(canUploadDocuments("CANCELLED"), false);
  });

  it("cancelada não pode ser aprovada (nenhum status cancelado passa no gate de aprovação)", () => {
    assert.equal(canApproveIntake("CANCELLED"), false);
    const approvable = INTAKE_STATUSES.filter((s) => canApproveIntake(s));
    assert.deepEqual(approvable.sort(), ["CHECKING", "REVIEW_REQUIRED"]);
  });

  it("cancelada não aceita reenvio da coleta pela cliente", () => {
    assert.equal(canCustomerSubmit("CANCELLED", false), false);
  });

  it("token público deixa de valer imediatamente após o cancelamento", () => {
    assert.equal(isIntakeLinkUsable("CANCELLED", false), false);
    assert.equal(isIntakeLinkUsable("AWAITING_CUSTOMER_DATA", false), true, "controle: link normal continua válido");
    // A função troca o hash do token: nenhum token antigo casa mais com a intake.
    assert.match(MIGRATION, /token_hash = 'cancelled:' \|\| gen_random_uuid\(\)::text/);
  });

  it("status CANCELLED tem rótulo próprio", () => {
    assert.equal(INTAKE_STATUS_LABELS.CANCELLED, "Cancelada");
  });
});

describe("cancelamento: motivo e observação", () => {
  it("motivo é obrigatório", () => {
    const r = validateCancelInput({ reason: undefined, note: "" });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.fieldErrors.reason);
  });

  it("motivo inválido é recusado", () => {
    const r = validateCancelInput({ reason: "QUALQUER_COISA", note: "" });
    assert.equal(r.ok, false);
  });

  it("OTHER exige observação", () => {
    const r = validateCancelInput({ reason: "OTHER", note: "   " });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.fieldErrors.note);
  });

  it("OTHER aceita observação curta, sem espaços nas pontas", () => {
    const r = validateCancelInput({ reason: "OTHER", note: "  Pedido duplicado no site  " });
    assert.deepEqual(r, { ok: true, reason: "OTHER", note: "Pedido duplicado no site" });
  });

  it("OTHER recusa observação acima do limite", () => {
    const r = validateCancelInput({ reason: "OTHER", note: "x".repeat(CANCEL_NOTE_MAX + 1) });
    assert.equal(r.ok, false);
  });

  it("motivos fixos não guardam texto livre", () => {
    const r = validateCancelInput({ reason: "CUSTOMER_WITHDREW", note: "texto que não deve ir" });
    assert.deepEqual(r, { ok: true, reason: "CUSTOMER_WITHDREW", note: null });
  });

  it("os quatro motivos têm rótulo amigável", () => {
    assert.equal(CANCEL_REASON_LABELS.CUSTOMER_WITHDREW, "Cliente desistiu da compra");
    assert.equal(CANCEL_REASON_LABELS.CANCELLED_IN_STI3, "Venda cancelada no STI3");
    assert.equal(CANCEL_REASON_LABELS.CREATED_BY_MISTAKE, "Cadastro criado por engano");
    assert.equal(CANCEL_REASON_LABELS.OTHER, "Outro");
  });
});

describe("cancelamento: histórico e auditoria no banco", () => {
  it("não exclui intake, tentativa, log nem PDF", () => {
    assert.doesNotMatch(MIGRATION, /delete\s+from/i);
    assert.doesNotMatch(MIGRATION, /truncate/i);
  });

  it("cancelamento preserva tentativas: a função não altera fulfillment_verification_attempts", () => {
    const fn = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.cancel_fulfillment_intake"));
    assert.doesNotMatch(fn, /fulfillment_verification_attempts/);
  });

  it("não cria fulfillment_record", () => {
    const fn = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.cancel_fulfillment_intake"));
    assert.doesNotMatch(fn, /insert into fulfillment_records/);
  });

  it("auditoria sem PII: só o código do motivo", () => {
    const fn = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.cancel_fulfillment_intake"));
    assert.match(fn, /jsonb_build_object\('reason', p_reason\)/);
    assert.doesNotMatch(fn, /insert into fulfillment_intake_audit_logs[\s\S]*submitted_/);
    assert.doesNotMatch(fn, /insert into fulfillment_intake_audit_logs[\s\S]*p_note/);
  });

  it("apenas Admin/Master e só antes da aprovação, dentro da função", () => {
    const fn = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.cancel_fulfillment_intake"));
    assert.match(fn, /if not is_admin\(\) then/);
    assert.match(fn, /v_row\.status = 'APPROVED' or v_row\.approved_record_id is not null/);
    assert.match(fn, /for update/);
  });

  it("função roda como SECURITY INVOKER (sem privilégio elevado)", () => {
    const fn = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.cancel_fulfillment_intake"), MIGRATION.indexOf("-- 7. Privilégios"));
    assert.doesNotMatch(fn.toLowerCase(), /security definer/);
  });

  it("is_admin() é verificado antes de qualquer leitura ou escrita", () => {
    const fn = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.cancel_fulfillment_intake"), MIGRATION.indexOf("-- 7. Privilégios"));
    const guard = fn.indexOf("if not is_admin() then");
    assert.ok(guard > 0, "guarda is_admin presente");
    for (const write of ["for update", "update fulfillment_intakes", "insert into fulfillment_intake_audit_logs"]) {
      assert.ok(guard < fn.indexOf(write), write);
    }
  });

  it("anon e PUBLIC não têm EXECUTE; authenticated tem", () => {
    assert.match(MIGRATION, /revoke all on function public\.cancel_fulfillment_intake\(uuid, text, text\) from public, anon;/);
    assert.match(MIGRATION, /grant execute on function public\.cancel_fulfillment_intake\(uuid, text, text\) to authenticated;/);
  });

  it("não remove policy, RLS nem grant existente", () => {
    assert.doesNotMatch(MIGRATION, /drop policy/i);
    assert.doesNotMatch(MIGRATION, /disable row level security/i);
    assert.doesNotMatch(MIGRATION, /\brevoke\b[^;]*\bfrom\s+authenticated\b/i);
  });

  it("observação só existe com OTHER; a função não grava observação para os demais motivos", () => {
    assert.match(MIGRATION, /cancel_note is null or \(length\(cancel_note\) between 1 and 280 and cancel_reason = 'OTHER'\)/);
    const fn = MIGRATION.slice(MIGRATION.indexOf("create or replace function public.cancel_fulfillment_intake"), MIGRATION.indexOf("-- 7. Privilégios"));
    assert.match(fn, /else\s+v_note := null;/);
  });

  it("integridade: CANCELLED exige data e motivo; fora de CANCELLED nenhum campo fica preenchido", () => {
    assert.match(MIGRATION, /status <> 'CANCELLED' or \(\s*cancelled_at is not null/);
    assert.match(MIGRATION, /status = 'CANCELLED' or \(cancelled_at is null and cancel_reason is null and cancel_note is null\)/);
  });

  it("motivos aceitos no banco são exatamente os quatro", () => {
    assert.match(MIGRATION, /cancel_reason in \(\s*'CUSTOMER_WITHDREW', 'CANCELLED_IN_STI3', 'CREATED_BY_MISTAKE', 'OTHER'/);
  });

  it("cancelada não volta ao fluxo ativo: trigger bloqueia mudança de status e de campos de cancelamento", () => {
    assert.match(MIGRATION, /create trigger fulfillment_intakes_block_cancelled[\s\S]*before update on public\.fulfillment_intakes/);
    assert.match(MIGRATION, /if old\.status = 'CANCELLED' and \(/);
    assert.match(MIGRATION, /new\.status is distinct from old\.status/);
    assert.match(MIGRATION, /new\.token_hash is distinct from old\.token_hash/);
  });

  it("a migration não é aplicada automaticamente e está marcada como proposta", () => {
    assert.match(MIGRATION, /PROPOSTA — NÃO APLICADA/);
  });
});

describe("listagem: Canceladas em seção própria", () => {
  const rows = INTAKE_STATUSES.map((status, i) => ({ id: `id-${i}`, status }));

  it("cada solicitação aparece em exatamente uma seção", () => {
    const groups = groupIntakeRows(rows);
    const seen = groups.flatMap((g) => g.items.map((r) => r.id));
    assert.equal(seen.length, rows.length);
    assert.equal(new Set(seen).size, rows.length);
  });

  it("cancelada aparece apenas em Canceladas", () => {
    const groups = groupIntakeRows(rows);
    for (const g of groups) {
      const hasCancelled = g.items.some((r) => r.status === "CANCELLED");
      assert.equal(hasCancelled, g.group.key === "cancelled", g.group.title);
    }
  });

  it("Canceladas é a última seção e tem o título certo", () => {
    const last = INTAKE_GROUPS[INTAKE_GROUPS.length - 1];
    assert.equal(last.title, "Canceladas");
    assert.deepEqual(last.statuses, ["CANCELLED"]);
  });

  it("as cinco seções anteriores não contêm cancelada", () => {
    for (const g of INTAKE_GROUPS.slice(0, -1)) {
      assert.equal(g.statuses.includes("CANCELLED"), false, g.title);
    }
  });
});

describe("CEP: máscara e normalização", () => {
  it("normaliza para 8 dígitos", () => {
    assert.equal(normalizeCep("79500-000"), "79500000");
    assert.equal(normalizeCep(" 79.500-000 "), "79500000");
  });

  it("máscara 00000-000", () => {
    assert.equal(formatCep("79500000"), "79500-000");
    assert.equal(formatCep("79500-000"), "79500-000");
  });

  it("máscara parcial durante a digitação", () => {
    assert.equal(formatCep("7"), "7");
    assert.equal(formatCep("7950"), "7950");
    assert.equal(formatCep("79500"), "79500");
    assert.equal(formatCep("795000"), "79500-0");
  });

  it("máximo de 8 dígitos", () => {
    assert.equal(formatCep("795000001234"), "79500-000");
    assert.equal(normalizeCep("795000001234"), "79500000");
  });

  it("letras são descartadas na entrada", () => {
    assert.equal(formatCep("7a9b5c0d0e0"), "79500-0");
  });

  it("validação exige exatamente 8 dígitos", () => {
    assert.equal(isValidCep("79500-000"), true);
    assert.equal(isValidCep("79500000"), true);
    assert.equal(isValidCep("7950-000"), false);
    assert.equal(isValidCep("795000"), false);
    assert.equal(isValidCep("795000000"), false);
    assert.equal(isValidCep("79500-00a"), false);
    assert.equal(isValidCep(""), false);
  });

  it("servidor recusa CEP inválido e grava somente os 8 dígitos", () => {
    const base = {
      fullName: "Teste Sintetico Final",
      cpf: "52998224725",
      email: "teste.final@example.com",
      whatsapp: "(11) 90000-0003",
      deliveryToCustomer: true,
      recipientName: "",
      addressLine: "Rua Teste Final",
      addressNumber: "100",
      addressComplement: "Apto Teste",
      noComplement: false,
      neighborhood: "Centro",
      city: "Campo Grande",
      state: "MS",
    };
    const ok = publicSubmitSchema.safeParse({ ...base, postalCode: "79500-000" });
    assert.equal(ok.success, true);
    assert.equal(ok.success && ok.data.postalCode, "79500000");
    assert.equal(publicSubmitSchema.safeParse({ ...base, postalCode: "7950-000" }).success, false);
    assert.equal(publicSubmitSchema.safeParse({ ...base, postalCode: "795000000" }).success, false);
  });
});

describe("formulário público: obrigatoriedade visível", () => {
  const FORM = read("src/app/dados-envio/[token]/PublicIntakeForm.tsx");

  it("texto 'Todos os campos são obrigatórios' acima do formulário", () => {
    assert.match(FORM, /Todos os campos são obrigatórios\./);
    assert.ok(FORM.indexOf("Todos os campos são obrigatórios") < FORM.indexOf("Dados pessoais"));
  });

  it("todos os rótulos obrigatórios mostram *", () => {
    for (const label of ["Nome completo *", "CPF *", "E-mail *", "WhatsApp *", "CEP *", "Rua *", "Número *", "Complemento *", "Bairro *", "Cidade *", "UF *", "Nome do destinatário *"]) {
      assert.ok(FORM.includes(`label="${label}"`), label);
    }
  });

  it("complemento continua com a alternativa 'Não possui complemento'", () => {
    assert.ok(FORM.includes("Não possui complemento"));
  });

  it("CEP usa a máscara no campo", () => {
    assert.match(FORM, /formatCep\(e\.target\.value\)/);
    assert.match(FORM, /placeholder="00000-000"/);
  });
});
