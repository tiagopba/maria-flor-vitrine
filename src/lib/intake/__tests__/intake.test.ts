import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { compareAddress, compareMoneyCents, normalizeStreet, toCents, type AddressInput } from "../address.ts";
import { isValidCpf } from "../cpf.ts";
import { decideVerdict, canApprove } from "../confere.ts";
import { formatPayment, validateInstallments, isPaymentMethod, PAYMENT_METHODS } from "../payment.ts";
import { generateIntakeToken, hashIntakeToken, intakeExpiresAt, isIntakeTokenExpired, INTAKE_TOKEN_TTL_DAYS } from "../token.ts";
import { canCustomerSubmit, canReopenCollection, canUploadDocuments, INTAKE_STATUSES } from "../status.ts";

const ADDR: AddressInput = {
  street: "Rua Ceará",
  number: "123",
  complement: "Apto 4",
  neighborhood: "Centro",
  city: "Campo Grande",
  state: "MS",
  postalCode: "79000-000",
};

describe("token público", () => {
  it("é aleatório e opaco (base64url de 32 bytes), sem dados pessoais", () => {
    const a = generateIntakeToken();
    const b = generateIntakeToken();
    assert.notEqual(a, b);
    assert.match(a, /^[A-Za-z0-9_-]{43}$/);
  });

  it("guarda só o hash SHA-256, nunca o token em claro", () => {
    const token = generateIntakeToken();
    const hash = hashIntakeToken(token);
    assert.equal(hash, createHash("sha256").update(token).digest("hex"));
    assert.notEqual(hash, token);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  it("validade de 7 dias; expira depois", () => {
    assert.equal(INTAKE_TOKEN_TTL_DAYS, 7);
    const now = new Date("2026-10-05T12:00:00Z");
    const exp = intakeExpiresAt(now);
    assert.equal(exp.getTime() - now.getTime(), 7 * 24 * 60 * 60 * 1000);
    assert.equal(isIntakeTokenExpired(exp, new Date(exp.getTime() - 1)), false);
    assert.equal(isIntakeTokenExpired(exp, exp), true);
  });
});

describe("CPF", () => {
  it("aceita CPF válido com e sem máscara", () => {
    assert.equal(isValidCpf("52998224725"), true);
    assert.equal(isValidCpf("529.982.247-25"), true);
  });

  it("recusa CPF inválido, sequência repetida e tamanho errado", () => {
    assert.equal(isValidCpf("52998224724"), false);
    assert.equal(isValidCpf("11111111111"), false);
    assert.equal(isValidCpf("1234"), false);
    assert.equal(isValidCpf(""), false);
    assert.equal(isValidCpf(null), false);
  });
});

describe("pagamento", () => {
  it("aceita as 6 formas e nenhuma outra", () => {
    assert.equal(PAYMENT_METHODS.length, 6);
    for (const m of ["PIX", "CASH", "DEBIT_CARD", "CREDIT_CARD", "CDC", "OTHER"]) assert.equal(isPaymentMethod(m), true);
    assert.equal(isPaymentMethod("BOLETO"), false);
  });

  it("parcelas só para CREDIT_CARD, de 1 a 12", () => {
    assert.deepEqual(validateInstallments("CREDIT_CARD", 3), { ok: true, value: 3 });
    assert.equal(validateInstallments("CREDIT_CARD", 0).ok, false);
    assert.equal(validateInstallments("CREDIT_CARD", 13).ok, false);
    assert.equal(validateInstallments("CREDIT_CARD", null).ok, false);
    assert.deepEqual(validateInstallments("PIX", 5), { ok: true, value: null });
  });

  it("exibição: 'Pix' e 'Cartão de crédito · 3x'", () => {
    assert.equal(formatPayment("PIX", null), "Pix");
    assert.equal(formatPayment("CREDIT_CARD", 3), "Cartão de crédito · 3x");
    assert.equal(formatPayment(null, null), "—");
  });
});

describe("endereço: abreviações e regras", () => {
  it("R. ↔ Rua, Av. ↔ Avenida, Rod. ↔ Rodovia, Trav. ↔ Travessa, sem caixa/acento/pontuação", () => {
    assert.equal(normalizeStreet("R. Ceará"), normalizeStreet("RUA CEARA"));
    assert.equal(normalizeStreet("Av. Afonso Pena"), normalizeStreet("avenida afonso  pena"));
    assert.equal(normalizeStreet("Rod. Anhanguera"), normalizeStreet("Rodovia Anhanguera"));
    assert.equal(normalizeStreet("Trav. dos Andradas"), normalizeStreet("travessa dos andradas"));
  });

  it("NÃO é fuzzy: ruas realmente diferentes continuam diferentes", () => {
    assert.notEqual(normalizeStreet("Rua Ceará"), normalizeStreet("Rua Ceara Velha"));
    assert.notEqual(normalizeStreet("Rua Alvorada"), normalizeStreet("Rua Alvorado"));
  });

  it("mesma rua após normalização → OK", () => {
    const res = compareAddress(ADDR, { ...ADDR, street: "R. Ceara" });
    assert.equal(res.find((r) => r.field === "rua")!.verdict, "OK");
  });

  it("número diferente → BLOCKED", () => {
    assert.equal(compareAddress(ADDR, { ...ADDR, number: "125" }).find((r) => r.field === "numero")!.verdict, "BLOCKED");
  });

  it("CEP diferente → BLOCKED (formatação ignorada: 79000000 = 79000-000)", () => {
    assert.equal(compareAddress(ADDR, { ...ADDR, postalCode: "79000000" }).find((r) => r.field === "cep")!.verdict, "OK");
    assert.equal(compareAddress(ADDR, { ...ADDR, postalCode: "79010000" }).find((r) => r.field === "cep")!.verdict, "BLOCKED");
  });

  it("cidade e UF diferentes → BLOCKED", () => {
    const res = compareAddress(ADDR, { ...ADDR, city: "Dourados", state: "MS" });
    assert.equal(res.find((r) => r.field === "cidade")!.verdict, "BLOCKED");
    assert.equal(compareAddress(ADDR, { ...ADDR, state: "SP" }).find((r) => r.field === "uf")!.verdict, "BLOCKED");
  });

  it("rua realmente diferente → BLOCKED", () => {
    assert.equal(compareAddress(ADDR, { ...ADDR, street: "Rua Outra" }).find((r) => r.field === "rua")!.verdict, "BLOCKED");
  });

  it("complemento e bairro ausentes ou diferentes → REVIEW", () => {
    const res = compareAddress(ADDR, { ...ADDR, complement: null, neighborhood: "Vila Nova" });
    assert.equal(res.find((r) => r.field === "complemento")!.verdict, "REVIEW");
    assert.equal(res.find((r) => r.field === "bairro")!.verdict, "REVIEW");
  });

  it("campo não legível no documento → REVIEW", () => {
    assert.equal(compareAddress(ADDR, { ...ADDR, street: null }).find((r) => r.field === "rua")!.verdict, "REVIEW");
  });
});

describe("valor em centavos, sem tolerância", () => {
  it("valor igual → OK; diferença de 1 centavo → BLOCKED", () => {
    assert.equal(compareMoneyCents(toCents(139.99), toCents(139.99)).verdict, "OK");
    assert.equal(compareMoneyCents(toCents(139.99), toCents(139.98)).verdict, "BLOCKED");
  });

  it("valor ausente na NF-e → REVIEW (nunca inventa)", () => {
    assert.equal(compareMoneyCents(toCents(139.99), null).verdict, "REVIEW");
  });

  it("valor com fração de centavo não representável é recusado (null)", () => {
    assert.equal(toCents(10.005), null);
  });
});

describe("veredito do CONFERE GERAL", () => {
  it("tudo OK → GREEN", () => {
    assert.equal(decideVerdict([{ field: "cpf", verdict: "OK", reason: "" }]).verdict, "GREEN");
  });

  it("qualquer BLOCKED → BLOCKED, mesmo com avisos", () => {
    const r = decideVerdict([
      { field: "cep", verdict: "BLOCKED", reason: "" },
      { field: "bairro", verdict: "REVIEW", reason: "" },
    ]);
    assert.equal(r.verdict, "BLOCKED");
  });

  it("amarelo exige marcar TODOS os avisos como revisados", () => {
    const r = decideVerdict([{ field: "bairro", verdict: "REVIEW", reason: "" }, { field: "complemento", verdict: "REVIEW", reason: "" }]);
    assert.equal(r.verdict, "REVIEW");
    assert.equal(canApprove(r, ["bairro"]).ok, false);
    assert.equal(canApprove(r, ["bairro", "complemento"]).ok, true);
  });

  it("vermelho não tem bypass: nenhuma revisão libera", () => {
    const r = decideVerdict([{ field: "cep", verdict: "BLOCKED", reason: "" }]);
    assert.equal(canApprove(r, ["cep", "bairro"]).ok, false);
  });
});

describe("status do pré-faturamento", () => {
  it("tem os 7 status pedidos", () => {
    assert.deepEqual([...INTAKE_STATUSES], [
      "AWAITING_CUSTOMER_DATA",
      "DATA_RECEIVED",
      "DOCUMENTS_PENDING",
      "CHECKING",
      "REVIEW_REQUIRED",
      "BLOCKED",
      "APPROVED",
    ]);
  });

  it("cliente só envia enquanto aguarda e dentro da validade", () => {
    assert.equal(canCustomerSubmit("AWAITING_CUSTOMER_DATA", false), true);
    assert.equal(canCustomerSubmit("AWAITING_CUSTOMER_DATA", true), false);
    assert.equal(canCustomerSubmit("DATA_RECEIVED", false), false);
  });

  it("reabrir não é permitido depois de aprovada; documentos só depois de receber os dados", () => {
    assert.equal(canReopenCollection("APPROVED"), false);
    assert.equal(canReopenCollection("DATA_RECEIVED"), true);
    assert.equal(canUploadDocuments("AWAITING_CUSTOMER_DATA"), false);
    assert.equal(canUploadDocuments("DATA_RECEIVED"), true);
  });
});
