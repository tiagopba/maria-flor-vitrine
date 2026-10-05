import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCustomerWhatsapp, normalizeCustomerWhatsapp } from "../phone.ts";
import { whatsappUrl } from "../post-sale.ts";

describe("normalização do WhatsApp brasileiro", () => {
  it("aceita formato com máscara, sem máscara e com +55, e guarda 55 + DDD + celular", () => {
    for (const input of ["(67) 99999-9999", "67999999999", "+55 67 99999-9999", "5567999999999", " 55 (67) 99999-9999 "]) {
      assert.deepEqual(normalizeCustomerWhatsapp(input), { ok: true, value: "5567999999999" }, input);
    }
  });

  it("com e sem +55 chegam ao mesmo valor", () => {
    assert.equal(
      (normalizeCustomerWhatsapp("(67) 99999-9999") as { value: string }).value,
      (normalizeCustomerWhatsapp("+55 67 99999-9999") as { value: string }).value
    );
  });

  it("recusa número inválido, sem inventar nada", () => {
    for (const input of ["", "   ", "123", "6733334444", "(67) 3333-4444", "abc", "67 9999-99999999", "+1 415 555 0100", null, undefined]) {
      const result = normalizeCustomerWhatsapp(input as string | null | undefined);
      assert.equal(result.ok, false, String(input));
    }
  });

  it("recusa celular que não começa com 9 (fixo não é WhatsApp)", () => {
    assert.equal(normalizeCustomerWhatsapp("(67) 3333-4444").ok, false);
    assert.equal(normalizeCustomerWhatsapp("6733334444").ok, false);
  });

  it("formata para exibir sem alterar o valor guardado", () => {
    assert.equal(formatCustomerWhatsapp("5567999999999"), "(67) 99999-9999");
    assert.equal(formatCustomerWhatsapp(null), null);
    assert.equal(formatCustomerWhatsapp("67999999999"), null);
  });
});

describe("link wa.me/api com código do país 55", () => {
  it("número sem +55 gera link com 55", () => {
    assert.match(whatsappUrl("67999999999", "oi")!, /phone=5567999999999&/);
  });

  it("número com +55 gera o mesmo link", () => {
    assert.equal(whatsappUrl("+55 67 99999-9999", "oi"), whatsappUrl("67999999999", "oi"));
  });

  it("sem número válido não há link (a UI oferece só copiar)", () => {
    assert.equal(whatsappUrl(null, "oi"), null);
    assert.equal(whatsappUrl("6733334444", "oi"), null);
  });
});
