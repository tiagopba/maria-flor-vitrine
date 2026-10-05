import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DanfeData, ShippingLabelData } from "../../fulfillment/types.ts";
import { canApprove } from "../confere.ts";
import { conferir, type ExpectedData } from "../conferir.ts";

const CPF = "52998224725";

const EXPECTED: ExpectedData = {
  customerName: "Neusa Cardim",
  cpf: CPF,
  address: {
    street: "Rua Ceará",
    number: "123",
    complement: "Apto 4",
    neighborhood: "Centro",
    city: "Campo Grande",
    state: "MS",
    postalCode: "79000000",
  },
  recipientName: "Neusa Cardim",
  saleTotal: 139.99,
};

const DANFE: DanfeData = {
  customerName: "NEUSA CARDIM",
  customerDocument: CPF,
  addressLine: "R. Ceara",
  addressNumber: "123",
  addressComplement: "Apto 4",
  neighborhood: "Centro",
  postalCode: null,
  city: "Campo Grande",
  state: "MS",
  nfeNumber: "6",
  nfeSeries: "2",
  nfeKey: "50261028117328000101550020000000061236477561",
  nfeProtocol: "150260045136601",
  nfeIssuedAt: "2026-10-02",
  itemsCount: 1,
  invoiceTotal: 139.99,
};

const LABEL: ShippingLabelData = {
  recipientName: "NEUSA CARDIM",
  addressLine: "Rua Ceara 123",
  addressStreet: "Rua Ceara",
  addressNumber: "123",
  addressRemainder: null,
  addressComplement: "Apto 4",
  neighborhood: "Centro",
  postalCode: "79000000",
  city: "Campo Grande",
  state: "MS",
  labelDateTime: "2026-10-05T11:05:00",
  carrier: "J&T Express",
  shippingService: null,
  trackingCode: "888100002197060",
};

const run = (over: { danfe?: Partial<DanfeData> | null; label?: Partial<ShippingLabelData> | null; expected?: Partial<ExpectedData> } = {}) =>
  conferir({
    expected: { ...EXPECTED, ...(over.expected ?? {}) },
    danfe: over.danfe === null ? null : { ...DANFE, ...(over.danfe ?? {}) },
    label: over.label === null ? null : { ...LABEL, ...(over.label ?? {}) },
  });

const fieldOf = (r: ReturnType<typeof run>, name: string) => r.results.find((x) => x.field === name)!.verdict;

describe("CONFERE GERAL: 🟢 verde", () => {
  it("DANFE + etiqueta corretas → GREEN, sem avisos", () => {
    const r = run();
    assert.equal(r.verdict, "GREEN", JSON.stringify(r.results.filter((x) => x.verdict !== "OK")));
    assert.deepEqual(r.reviewFields, []);
  });

  it("extrai NF-e, série, chave, valor, transportadora, serviço e rastreio", () => {
    const r = run();
    assert.equal(r.extracted.nfe_number, "6");
    assert.equal(r.extracted.nfe_series, "2");
    assert.equal(r.extracted.nfe_key, DANFE.nfeKey);
    assert.equal(r.extracted.invoice_total, 139.99);
    assert.equal(r.extracted.carrier, "J&T Express");
    assert.equal(r.extracted.shipping_service, null);
    assert.equal(r.extracted.tracking_code, "888100002197060");
  });
});

describe("CONFERE GERAL: 🔴 divergência crítica = BLOCKED", () => {
  it("CPF diferente → vermelho", () => {
    const r = run({ danfe: { customerDocument: "11144477735" } });
    assert.equal(fieldOf(r, "cpf"), "BLOCKED");
    assert.equal(r.verdict, "BLOCKED");
  });

  it("CEP diferente → vermelho (na etiqueta)", () => {
    const r = run({ label: { postalCode: "79010000" } });
    assert.equal(fieldOf(r, "etiqueta_cep"), "BLOCKED");
    assert.equal(r.verdict, "BLOCKED");
  });

  it("número diferente → vermelho", () => {
    const r = run({ danfe: { addressNumber: "999" } });
    assert.equal(fieldOf(r, "nf_numero"), "BLOCKED");
  });

  it("rua realmente diferente → vermelho", () => {
    const r = run({ label: { addressStreet: "Rua Outra" } });
    assert.equal(fieldOf(r, "etiqueta_rua"), "BLOCKED");
  });

  it("cidade diferente → vermelho", () => {
    const r = run({ label: { city: "Dourados" } });
    assert.equal(fieldOf(r, "etiqueta_cidade"), "BLOCKED");
  });

  it("UF diferente → vermelho", () => {
    const r = run({ danfe: { state: "SP" } });
    assert.equal(fieldOf(r, "nf_uf"), "BLOCKED");
  });

  it("valor da NF-e diferente da venda → vermelho, em centavos", () => {
    const r = run({ danfe: { invoiceTotal: 139.98 } });
    assert.equal(fieldOf(r, "valor"), "BLOCKED");
    assert.equal(r.verdict, "BLOCKED");
  });

  it("destinatário da etiqueta incompatível → vermelho", () => {
    const r = run({ label: { recipientName: "OUTRA PESSOA" } });
    assert.equal(fieldOf(r, "etiqueta_destinatario"), "BLOCKED");
  });

  it("vermelho NÃO tem bypass: nenhuma revisão libera a aprovação", () => {
    const r = run({ danfe: { customerDocument: "11144477735" } });
    assert.equal(canApprove(r, ["cpf", "nome", "bairro", "complemento"]).ok, false);
  });
});

describe("CONFERE GERAL: 🟡 revisão", () => {
  it("campo não legível (bairro ausente na etiqueta) → amarelo, sem bloquear", () => {
    const r = run({ label: { neighborhood: null } });
    assert.equal(fieldOf(r, "etiqueta_bairro"), "REVIEW");
    assert.equal(r.verdict, "REVIEW");
  });

  it("amarelo exige marcar TODOS os avisos antes de aprovar", () => {
    const r = run({ label: { neighborhood: null, addressComplement: null } });
    assert.equal(r.verdict, "REVIEW");
    assert.equal(canApprove(r, []).ok, false);
    assert.equal(canApprove(r, ["etiqueta_bairro"]).ok, false);
    assert.equal(canApprove(r, r.reviewFields).ok, true);
  });

  it("DANFE ilegível → amarelo nos campos dependentes", () => {
    const r = run({ danfe: null });
    assert.equal(r.verdict, "REVIEW");
    assert.equal(fieldOf(r, "danfe_legivel"), "REVIEW");
  });

  it("nome diferente da DANFE → amarelo (avaliação humana), não bloqueio", () => {
    const r = run({ danfe: { customerName: "NEUSA CARDIM SILVA" } });
    assert.equal(fieldOf(r, "nome"), "REVIEW");
    assert.notEqual(fieldOf(r, "nome"), "BLOCKED");
  });
});

describe("CONFERE GERAL: abreviação não gera falso vermelho", () => {
  it("R. Ceara na DANFE × Rua Ceará do cliente → OK na rua", () => {
    const r = run();
    assert.equal(fieldOf(r, "nf_rua"), "OK");
  });
});
