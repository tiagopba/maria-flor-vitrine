import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { adminIntakeSchema } from "../schema.ts";
import { isValidCpf } from "../cpf.ts";
import { hashIntakeToken, generateIntakeToken } from "../token.ts";
import { trackingCarrier } from "../../fulfillment/post-sale.ts";
import { isJtLabelDocument } from "../conferir.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const SELLER = "11111111-1111-4111-8111-111111111111";

const ADMIN = {
  customerName: "Teste Sintetico Coleta",
  customerWhatsapp: "(11) 90000-0002",
  sellerId: SELLER,
  saleDate: "2026-10-05",
  saleTotal: "139,99",
  paymentMethod: "PIX",
  installments: "",
  internalNotes: "",
};

describe("solicitação do Admin: campos obrigatórios", () => {
  it("vendedora ausente → recusada", () => {
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, sellerId: "" }).success, false);
  });

  it("vendedora com formato inválido → recusada", () => {
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, sellerId: "abc" }).success, false);
  });

  it("cliente, WhatsApp, data e valor obrigatórios", () => {
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, customerName: "   " }).success, false);
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, customerWhatsapp: "" }).success, false);
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, saleDate: "" }).success, false);
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, saleTotal: "" }).success, false);
  });

  it("forma de pagamento obrigatória", () => {
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, paymentMethod: "" }).success, false);
  });

  it("cartão de crédito sem parcelas → recusado", () => {
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, paymentMethod: "CREDIT_CARD", installments: "" }).success, false);
  });

  it("outros métodos: parcelas ficam nulas (não aplicáveis)", () => {
    const r = adminIntakeSchema.safeParse({ ...ADMIN, paymentMethod: "PIX" });
    assert.ok(r.success);
    assert.equal(r.data.installments, null);
  });

  it("valor precisa ser maior que zero", () => {
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, saleTotal: "0" }).success, false);
  });
});

describe("CPF: helper único, frontend e servidor", () => {
  it("válido com e sem máscara; incorreto, repetido e incompleto são recusados", () => {
    assert.equal(isValidCpf("529.982.247-25"), true);
    assert.equal(isValidCpf("52998224725"), true);
    assert.equal(isValidCpf("529.982.247-24"), false);
    assert.equal(isValidCpf("11111111111"), false);
    assert.equal(isValidCpf("5299822472"), false);
  });

  it("o formulário público e o servidor usam o mesmo helper", () => {
    assert.match(read("src/lib/intake/schema.ts"), /isValidCpf/);
    assert.match(read("src/lib/intake/schema.ts"), /Informe um CPF válido\./);
    assert.match(read("src/app/dados-envio/[token]/PublicIntakeForm.tsx"), /publicSubmitSchema\.safeParse/);
    assert.match(read("src/app/dados-envio/[token]/actions.ts"), /publicSubmitSchema\.safeParse/);
  });
});

describe("REABRIR COLETA: link novo aparece e o antigo deixa de valer", () => {
  it("a action devolve o link novo na própria resposta (o token bruto não é guardado)", () => {
    const src = read("src/app/admin/faturamento-envios/pre/actions.ts");
    const reopen = src.slice(src.indexOf("export async function reopenIntakeAction"));
    assert.match(reopen, /return \{ ok: true, id, link, whatsappUrl/);
    assert.doesNotMatch(reopen, /revalidatePath/);
    assert.match(reopen, /reopenIntake\(\{ id, tokenHash: hashIntakeToken\(token\)/);
  });

  it("o painel mostra o link a partir da resposta e só depois atualiza o status", () => {
    const src = read("src/app/admin/faturamento-envios/pre/[id]/ReopenPanel.tsx");
    const block = src.slice(src.indexOf("setLink(result.link)"), src.indexOf("router.refresh()"));
    assert.match(src, /setLink\(result\.link\);/);
    assert.ok(src.indexOf("setLink(result.link)") < src.indexOf("router.refresh()"));
    assert.equal(block.includes("setLink") && block.length > 0, true);
  });

  it("o banco troca o hash: token antigo não casa mais com nenhuma solicitação", () => {
    const db = read("src/lib/db/intakes.ts");
    assert.match(db, /token_hash: input\.tokenHash,\s*token_expires_at: input\.expiresAt/);
    const oldToken = generateIntakeToken();
    const newToken = generateIntakeToken();
    assert.notEqual(hashIntakeToken(oldToken), hashIntakeToken(newToken));
  });

  it("o token bruto não é gravado: só o hash vai ao banco", () => {
    assert.doesNotMatch(read("src/lib/db/intakes.ts"), /token_hash: input\.token(?!Hash)/);
  });
});

describe("J&T com logo sem texto (carrier ausente)", () => {
  it("rastreio compatível com J&T → identificada como J&T", () => {
    assert.equal(isJtLabelDocument({ carrier: null, trackingCode: "888100009999998" } as never), true);
  });

  it("Correios NÃO é confundido com J&T (AD…BR, mesmo sem carrier)", () => {
    assert.equal(isJtLabelDocument({ carrier: null, trackingCode: "AD981445191BR" } as never), false);
    assert.equal(isJtLabelDocument({ carrier: "Correios", trackingCode: "888100009999998" } as never), false);
  });

  it("carrier de texto tem prioridade e 'J&T' por texto é reconhecido", () => {
    assert.equal(trackingCarrier("J&T Express"), "jt");
    assert.equal(trackingCarrier("Correios"), "correios");
  });
});
