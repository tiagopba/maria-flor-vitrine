import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { editCustomerSchema, editSaleSchema } from "../edit-schema.ts";

const VALID_SALE = {
  sti3SaleId: "23706",
  customerName: "Maria da Silva Exemplo",
  customerWhatsapp: "(67) 99999-9999",
  sellerId: "11111111-1111-1111-1111-111111111111",
  saleDate: "2026-10-10",
  saleTotal: "334,97",
  paymentMethod: "ITAU_PIX",
  internalNotes: "",
};

const VALID_CUSTOMER = {
  submittedName: "maria da silva exemplo",
  submittedCpf: "111.444.777-35",
  submittedEmail: "maria@exemplo.com",
  submittedWhatsapp: "(67) 99999-9999",
  submittedDeliveryToCustomer: true,
  submittedRecipientName: "",
  submittedPostalCode: "79500-000",
  submittedAddressLine: "rua exemplo",
  submittedAddressNumber: "100",
  submittedAddressComplement: "entre as ruas 7 e 9",
  submittedNeighborhood: "jardim exemplo",
  submittedCity: "cidade exemplo",
  submittedState: "ms",
};

describe("editSaleSchema: mesma blindagem de valor que o fix do bug real (334.97 != 33497)", () => {
  it("aceita os dados válidos de venda", () => {
    const result = editSaleSchema.safeParse(VALID_SALE);
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.saleTotal, 334.97);
  });

  it("'334.97' (ponto como decimal) dá o mesmo valor que '334,97'", () => {
    const result = editSaleSchema.safeParse({ ...VALID_SALE, saleTotal: "334.97" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.saleTotal, 334.97);
  });

  it("recusa STI3 vazio e vendedora inválida", () => {
    assert.equal(editSaleSchema.safeParse({ ...VALID_SALE, sti3SaleId: "" }).success, false);
    assert.equal(editSaleSchema.safeParse({ ...VALID_SALE, sellerId: "não-é-uuid" }).success, false);
  });
});

describe("editCustomerSchema: CAIXA ALTA preservando acentos nos campos da cliente, e-mail intocado", () => {
  it("nome, rua, complemento, bairro, cidade e UF viram CAIXA ALTA", () => {
    const result = editCustomerSchema.safeParse(VALID_CUSTOMER);
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.data.submittedName, "MARIA DA SILVA EXEMPLO");
    assert.equal(result.data.submittedAddressLine, "RUA EXEMPLO");
    assert.equal(result.data.submittedAddressComplement, "ENTRE AS RUAS 7 E 9");
    assert.equal(result.data.submittedNeighborhood, "JARDIM EXEMPLO");
    assert.equal(result.data.submittedCity, "CIDADE EXEMPLO");
    assert.equal(result.data.submittedState, "MS");
  });

  it("preserva acentos ao normalizar", () => {
    const result = editCustomerSchema.safeParse({ ...VALID_CUSTOMER, submittedCity: "goiânia" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.submittedCity, "GOIÂNIA");
  });

  it("e-mail NUNCA vira caixa alta", () => {
    const result = editCustomerSchema.safeParse({ ...VALID_CUSTOMER, submittedEmail: "Maria.Exemplo@Dominio.com" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.submittedEmail, "Maria.Exemplo@Dominio.com");
  });

  it("CPF e CEP continuam normalizados só para dígitos (não caixa alta, não têm letra)", () => {
    const result = editCustomerSchema.safeParse(VALID_CUSTOMER);
    assert.equal(result.success, true);
    if (!result.success) return;
    assert.equal(result.data.submittedCpf, "11144477735");
    assert.equal(result.data.submittedPostalCode, "79500000");
  });

  it("destinatário exige nome completo quando não é a própria cliente", () => {
    const result = editCustomerSchema.safeParse({ ...VALID_CUSTOMER, submittedDeliveryToCustomer: false, submittedRecipientName: "sozinho" });
    assert.equal(result.success, false);
  });

  it("destinatário em CAIXA ALTA quando preenchido", () => {
    const result = editCustomerSchema.safeParse({ ...VALID_CUSTOMER, submittedDeliveryToCustomer: false, submittedRecipientName: "joão exemplo da silva" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.submittedRecipientName, "JOÃO EXEMPLO DA SILVA");
  });

  it("CPF inválido (dígito verificador errado) é recusado", () => {
    const result = editCustomerSchema.safeParse({ ...VALID_CUSTOMER, submittedCpf: "111.444.777-36" });
    assert.equal(result.success, false);
  });
});
