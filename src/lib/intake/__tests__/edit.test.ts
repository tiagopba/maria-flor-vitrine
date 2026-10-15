import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { conferenceAffectedByEdit, validateEditReasonInput } from "../edit.ts";

describe("validateEditReasonInput: motivo obrigatório, 'Outro' exige observação", () => {
  it("recusa sem motivo", () => {
    const result = validateEditReasonInput({ reason: "", note: "" });
    assert.equal(result.ok, false);
  });

  it("aceita os 3 motivos fechados sem observação, e devolve note: null (nunca persistida para estes)", () => {
    for (const reason of ["SALE_TYPO", "CUSTOMER_REQUESTED_CORRECTION", "NFE_ISSUANCE_CORRECTION"]) {
      const result = validateEditReasonInput({ reason, note: "" });
      assert.equal(result.ok, true);
      if (result.ok) assert.equal(result.note, null);
    }
  });

  it("'Outro' sem observação é recusado", () => {
    const result = validateEditReasonInput({ reason: "OTHER", note: "" });
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.fieldErrors.note ?? "", /explique/i);
  });

  it("'Outro' com observação é aceito e a observação (aparada) volta para ser persistida no histórico privado", () => {
    const result = validateEditReasonInput({ reason: "OTHER", note: "  Divergência combinada por telefone com a cliente.  " });
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.note, "Divergência combinada por telefone com a cliente.");
  });

  it("'Outro' com observação longa demais é recusado", () => {
    const result = validateEditReasonInput({ reason: "OTHER", note: "a".repeat(281) });
    assert.equal(result.ok, false);
  });
});

describe("conferenceAffectedByEdit: só campos usados na comparação com o XML invalidam a conferência", () => {
  it("rua, CPF, valor etc. participam", () => {
    assert.equal(conferenceAffectedByEdit(["submitted_address_line"]), true);
    assert.equal(conferenceAffectedByEdit(["sale_total"]), true);
    assert.equal(conferenceAffectedByEdit(["submitted_cpf", "internal_notes"]), true);
  });

  it("STI3, vendedora, pagamento, observação, e-mail e WhatsApp não participam", () => {
    assert.equal(conferenceAffectedByEdit(["sti3_sale_id", "seller_id", "payment_method", "internal_notes", "submitted_email", "submitted_whatsapp", "customer_whatsapp"]), false);
  });

  it("lista vazia nunca afeta", () => {
    assert.equal(conferenceAffectedByEdit([]), false);
  });
});

// A decisão de "qual o próximo status" (nextStatusAfterEdit) deixou de existir
// como função TS: agora é calculada dentro de edit_fulfillment_intake (SQL),
// atomicamente com o UPDATE. Ver edit-rpc-migration.test.ts (paridade com
// CONFERENCE_AFFECTING_COLUMNS) e edit-rpc-atomicity.test.ts (prova real, com
// Postgres em WASM, de que BLOCKED/REVIEW nunca "sobe" sozinho e de que a
// tentativa anterior nunca é tocada).
