import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { adminIntakeSchema, publicSubmitSchema } from "../schema.ts";
import { buildIntakeLinkMessage, intakeWhatsappUrl } from "../messages.ts";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");

const ADMIN = {
  customerName: "Neusa Cardim",
  customerWhatsapp: "(67) 99999-9999",
  sellerId: "11111111-1111-4111-8111-111111111111",
  saleDate: "2026-10-05",
  saleTotal: "139,99",
  paymentMethod: "ITAU_PIX",
  sti3SaleId: "123456",
  internalNotes: "",
};

describe("número da venda STI3", () => {
  it("obrigatório: vazio e só espaços são recusados", () => {
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, sti3SaleId: "" }).success, false);
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, sti3SaleId: "   " }).success, false);
  });

  it("tratado como texto: aceita não-inteiro e normaliza espaços nas pontas", () => {
    const r = adminIntakeSchema.safeParse({ ...ADMIN, sti3SaleId: "  STI3-2026/0042  " });
    assert.ok(r.success);
    assert.equal(r.data.sti3SaleId, "STI3-2026/0042");
  });

  it("limite de tamanho razoável", () => {
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, sti3SaleId: "9".repeat(41) }).success, false);
  });
});

describe("formulário interno SOLICITAR DADOS", () => {
  it("aceita dados válidos e normaliza valor e WhatsApp", () => {
    const r = adminIntakeSchema.safeParse(ADMIN);
    assert.ok(r.success);
    assert.equal(r.data.saleTotal, 139.99);
    assert.equal(r.data.customerWhatsapp, "5567999999999");
    assert.equal(r.data.sellerId, "11111111-1111-4111-8111-111111111111");
  });

  it("cartão genérico antigo (CREDIT_CARD) não é aceito em nova solicitação", () => {
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, paymentMethod: "CREDIT_CARD" }).success, false);
  });

  it("parcelas não existem no fluxo novo: o campo não é lido e installments é null", () => {
    const r = adminIntakeSchema.safeParse({ ...ADMIN, paymentMethod: "ITAU_CREDIT_VISA", installments: "3" });
    assert.ok(r.success);
    assert.equal("installments" in r.data, false);
  });

  it("recusa forma de pagamento desconhecida, valor zero e data inválida", () => {
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, paymentMethod: "BOLETO" }).success, false);
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, saleTotal: "0" }).success, false);
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, saleDate: "2026-02-31" }).success, false);
  });

  it("WhatsApp inválido é recusado", () => {
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, customerWhatsapp: "6733334444" }).success, false);
  });
});

const PUBLIC = {
  fullName: "Neusa Cardim",
  cpf: "529.982.247-25",
  email: "teste.sintetico@example.com",
  whatsapp: "(67) 99999-9999",
  deliveryToCustomer: true,
  recipientName: "",
  postalCode: "79000-000",
  addressLine: "Rua Ceará",
  addressNumber: "123",
  addressComplement: "",
  noComplement: true,
  neighborhood: "Centro",
  city: "Campo Grande",
  state: "ms",
};

describe("formulário público da cliente", () => {
  it("dados válidos: CPF só dígitos, UF maiúscula, sem complemento declarado", () => {
    const r = publicSubmitSchema.safeParse(PUBLIC);
    assert.ok(r.success);
    assert.equal(r.data.cpf, "52998224725");
    assert.equal(r.data.state, "MS");
    assert.equal(r.data.noComplement, true);
    assert.equal(r.data.postalCode, "79000000");
  });

  it("CPF inválido é recusado", () => {
    assert.equal(publicSubmitSchema.safeParse({ ...PUBLIC, cpf: "529.982.247-24" }).success, false);
  });

  it("WhatsApp inválido é recusado", () => {
    assert.equal(publicSubmitSchema.safeParse({ ...PUBLIC, whatsapp: "123" }).success, false);
  });

  it("nome precisa de sobrenome", () => {
    assert.equal(publicSubmitSchema.safeParse({ ...PUBLIC, fullName: "Neusa" }).success, false);
  });

  it("CEP com 8 dígitos e UF válida", () => {
    assert.equal(publicSubmitSchema.safeParse({ ...PUBLIC, postalCode: "7900000" }).success, false);
    assert.equal(publicSubmitSchema.safeParse({ ...PUBLIC, state: "XX" }).success, false);
  });

  it("entrega para outra pessoa exige o nome do destinatário", () => {
    assert.equal(publicSubmitSchema.safeParse({ ...PUBLIC, deliveryToCustomer: false, recipientName: "" }).success, false);
    assert.ok(publicSubmitSchema.safeParse({ ...PUBLIC, deliveryToCustomer: false, recipientName: "João Silva" }).success);
  });
});

describe("mensagem do link", () => {
  it("texto pedido, com o link e a assinatura", () => {
    const text = buildIntakeLinkMessage("NEUSA CARDIM", "https://x.test/dados-envio/abc");
    assert.equal(
      text,
      [
        "Olá, Neusa Cardim! 💕",
        "Para emitirmos sua nota fiscal e prepararmos o envio do seu pedido, precisamos que você preencha seus dados neste link seguro:",
        "https://x.test/dados-envio/abc",
        "É rapidinho. 🌷",
        "Maria Flor",
      ].join("\n")
    );
  });

  it("WhatsApp com código 55; sem número válido não há link", () => {
    assert.match(intakeWhatsappUrl("67999999999", "Neusa", "https://x") ?? "", /phone=5567999999999/);
    assert.equal(intakeWhatsappUrl(null, "Neusa", "https://x"), null);
  });
});

/** Código sem comentários: o teste estático não deve acusar palavras que só aparecem em comentário. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, entry);
    if (statSync(join(ROOT, rel)).isDirectory()) out.push(...listFiles(rel));
    else out.push(rel);
  }
  return out;
}

describe("segurança do pré-faturamento (estático)", () => {
  const PUBLIC_DIR = "src/app/dados-envio";
  const INTAKE_FILES = [
    ...listFiles("src/lib/intake").filter((f) => f.endsWith(".ts") && !f.includes("__tests__")),
    ...listFiles(PUBLIC_DIR),
    ...listFiles("src/app/admin/faturamento-envios/pre"),
    "src/lib/db/intakes.ts",
  ];

  it("a página pública fica FORA do layout (public): sem Pixel, CAPI, analytics ou presença", () => {
    assert.ok(!PUBLIC_DIR.startsWith("src/app/(public)"));
    for (const f of listFiles(PUBLIC_DIR)) {
      assert.doesNotMatch(code(f), /MetaPixel|CAPI|@\/lib\/analytics|@\/components\/analytics|PageViewTracker|SitePresenceTracker|NavigationTracker/, f);
    }
  });

  it("nenhum arquivo do pré-faturamento usa localStorage/sessionStorage (PII)", () => {
    for (const f of INTAKE_FILES) assert.doesNotMatch(code(f), /localStorage|sessionStorage/, f);
  });

  it("o token em claro nunca é logado nem gravado; só o hash vai ao banco", () => {
    const actions = read("src/app/admin/faturamento-envios/pre/actions.ts");
    assert.doesNotMatch(actions, /console\.|insertIntakeAudit\([^)]*token/);
    assert.match(actions, /tokenHash: hashIntakeToken\(token\)/);
    const db = read("src/lib/db/intakes.ts");
    assert.doesNotMatch(db, /token_hash: input\.token(?!Hash)/);
  });

  it("o link público valida o token pelo HASH e recusa tokens fora do formato", () => {
    const action = read("src/app/dados-envio/[token]/actions.ts");
    assert.match(action, /hashIntakeToken\(token\)/);
    assert.match(action, /token\.length < 20 \|\| token\.length > 100/);
  });

  it("envio público é de uma vez só (condição de status e submitted_at vazio)", () => {
    const db = read("src/lib/db/intakes.ts");
    assert.match(db, /\.eq\("status", "AWAITING_CUSTOMER_DATA"\)\s*\.is\("submitted_at", null\)/);
  });

  it("nenhum evento de auditoria recebe dados pessoais (details vazio ou só nomes de campo)", () => {
    const action = read("src/app/dados-envio/[token]/actions.ts");
    assert.match(action, /insertIntakeAuditSystem\(row\.id, "INTAKE_DATA_RECEIVED"\)/);
    const db = read("src/lib/db/intakes.ts");
    assert.match(db, /details: \{\}/);
  });

  it("migration proposta: RLS só is_admin(), anon sem acesso, sem policy pública", () => {
    const sql = read("supabase/migrations/20261005240000_fulfillment_intakes.sql");
    assert.doesNotMatch(sql, /to anon|for all using \(true\)/i);
    assert.match(sql, /revoke all on table public\.fulfillment_intakes from anon;/);
    assert.match(sql, /function public\.approve_fulfillment_intake/);
    assert.match(sql, /revoke all on function public\.approve_fulfillment_intake\(uuid, integer, jsonb\) from public, anon;/);
  });
});

describe("campos obrigatórios e validações do formulário público", () => {
  const base = PUBLIC;
  const hasIssueOn = (input: object, field: string) => {
    const r = publicSubmitSchema.safeParse(input);
    return !r.success && r.error.issues.some((i) => i.path[0] === field);
  };

  it("CPF válido com máscara é aceito", () => {
    assert.ok(publicSubmitSchema.safeParse({ ...base, cpf: "529.982.247-25" }).success);
  });

  it("CPF com dígito verificador incorreto → 'Informe um CPF válido.'", () => {
    const r = publicSubmitSchema.safeParse({ ...base, cpf: "529.982.247-24" });
    assert.equal(r.success, false);
    assert.equal(r.success ? "" : r.error.issues.find((i) => i.path[0] === "cpf")!.message, "Informe um CPF válido.");
  });

  it("CPF com menos de 11 dígitos é recusado", () => {
    assert.equal(hasIssueOn({ ...base, cpf: "5299822472" }, "cpf"), true);
  });

  it("CPF repetido 11111111111 é recusado", () => {
    assert.equal(hasIssueOn({ ...base, cpf: "11111111111" }, "cpf"), true);
  });

  it("CPF vazio → 'Informe o CPF.'", () => {
    const r = publicSubmitSchema.safeParse({ ...base, cpf: "" });
    assert.equal(r.success ? "" : r.error.issues.find((i) => i.path[0] === "cpf")!.message, "Informe o CPF.");
  });

  it("formulário com campo obrigatório vazio é recusado (rua, número, bairro, cidade, nome, WhatsApp)", () => {
    for (const f of ["addressLine", "addressNumber", "neighborhood", "city", "fullName", "whatsapp"]) {
      assert.equal(hasIssueOn({ ...base, [f]: "   " }, f), true, f);
    }
  });

  it("complemento vazio SEM marcar 'Não possui complemento' → recusado", () => {
    const r = publicSubmitSchema.safeParse({ ...base, addressComplement: "", noComplement: false });
    assert.equal(r.success, false);
    assert.equal(r.success ? "" : r.error.issues.find((i) => i.path[0] === "addressComplement")!.message, "Informe o complemento ou marque 'Não possui complemento'.");
  });

  it("complemento vazio COM 'Não possui complemento' marcado → aceito", () => {
    assert.ok(publicSubmitSchema.safeParse({ ...base, addressComplement: "", noComplement: true }).success);
  });

  it("complemento preenchido → aceito, mesmo sem marcar a declaração", () => {
    assert.ok(publicSubmitSchema.safeParse({ ...base, addressComplement: "Apto 4", noComplement: false }).success);
  });

  it("e-mail vazio é recusado (obrigatório)", () => {
    assert.equal(hasIssueOn({ ...base, email: "" }, "email"), true);
    assert.equal(hasIssueOn({ ...base, email: "   " }, "email"), true);
  });

  it("e-mail inválido é recusado", () => {
    assert.equal(hasIssueOn({ ...base, email: "sem-arroba.com" }, "email"), true);
    assert.equal(hasIssueOn({ ...base, email: "a@b" }, "email"), true);
  });

  it("CEP inválido (menos de 8 dígitos) é recusado", () => {
    assert.equal(hasIssueOn({ ...base, postalCode: "7900" }, "postalCode"), true);
  });

  it("UF inválida é recusada", () => {
    assert.equal(hasIssueOn({ ...base, state: "XX" }, "state"), true);
  });
});
