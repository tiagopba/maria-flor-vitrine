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
  sellerId: "",
  saleDate: "2026-10-05",
  saleTotal: "139,99",
  paymentMethod: "PIX",
  installments: "",
  internalNotes: "",
};

describe("formulário interno SOLICITAR DADOS", () => {
  it("aceita dados válidos e normaliza valor e WhatsApp", () => {
    const r = adminIntakeSchema.safeParse(ADMIN);
    assert.ok(r.success);
    assert.equal(r.data.saleTotal, 139.99);
    assert.equal(r.data.customerWhatsapp, "5567999999999");
    assert.equal(r.data.sellerId, null);
  });

  it("CREDIT_CARD exige parcelas de 1 a 12", () => {
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, paymentMethod: "CREDIT_CARD", installments: "" }).success, false);
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, paymentMethod: "CREDIT_CARD", installments: "13" }).success, false);
    const ok = adminIntakeSchema.safeParse({ ...ADMIN, paymentMethod: "CREDIT_CARD", installments: "3" });
    assert.ok(ok.success);
    assert.equal(ok.data.installments, 3);
  });

  it("parcelas são proibidas fora de cartão de crédito", () => {
    assert.equal(adminIntakeSchema.safeParse({ ...ADMIN, paymentMethod: "PIX", installments: "2" }).success, false);
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
  email: "",
  whatsapp: "(67) 99999-9999",
  deliveryToCustomer: true,
  recipientName: "",
  postalCode: "79000-000",
  addressLine: "Rua Ceará",
  addressNumber: "123",
  addressComplement: "",
  neighborhood: "Centro",
  city: "Campo Grande",
  state: "ms",
};

describe("formulário público da cliente", () => {
  it("dados válidos: CPF só dígitos, UF maiúscula, complemento vazio vira null", () => {
    const r = publicSubmitSchema.safeParse(PUBLIC);
    assert.ok(r.success);
    assert.equal(r.data.cpf, "52998224725");
    assert.equal(r.data.state, "MS");
    assert.equal(r.data.addressComplement, null);
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
