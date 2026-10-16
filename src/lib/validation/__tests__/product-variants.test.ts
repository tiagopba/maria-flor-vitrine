import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { saveProductVariantsPayloadSchema } from "../product-variants.ts";

const SHARED = {
  name: "Vestido Floral",
  description: null,
  category_id: "11111111-1111-4111-8111-111111111111",
  price: 149.9,
  promotional_price: null,
  cash_price: null,
  max_installments_override: null,
};

function basePayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    root_product_id: null,
    removed_variant_ids: [],
    shared: SHARED,
    variants: [
      {
        id: null,
        client_key: "client-key-1",
        color_id: null,
        status: "ACTIVE",
        featured: false,
        slug: "vestido-floral",
        sizes: ["P", "M"],
        images: [],
      },
    ],
    ...overrides,
  };
}

describe("saveProductVariantsPayloadSchema — client_key substitui code", () => {
  it("aceita uma variante nova sem nenhum campo `code` — o identificador nasce no banco", () => {
    const result = saveProductVariantsPayloadSchema.safeParse(basePayload());
    assert.equal(result.success, true);
    if (result.success) {
      // `code` nunca deve existir no payload validado: a RPC não aceita
      // mais essa coluna vindo do client (ver migration
      // 20261018110000_save_product_with_variants_internal_code.sql).
      assert.equal("code" in result.data.variants[0], false);
      assert.equal(result.data.variants[0].client_key, "client-key-1");
    }
  });

  it("rejeita variante sem client_key", () => {
    const payload = basePayload();
    // @ts-expect-error — teste intencional de payload inválido
    delete payload.variants[0].client_key;
    const result = saveProductVariantsPayloadSchema.safeParse(payload);
    assert.equal(result.success, false);
  });

  it("rejeita client_key vazio ou só espaços", () => {
    const payload = basePayload({
      variants: [{ ...basePayload().variants[0], client_key: "   " }],
    });
    assert.equal(saveProductVariantsPayloadSchema.safeParse(payload).success, false);
  });

  it("um `code` enviado por engano pelo client é ignorado (removido pelo parse), nunca repassado pra RPC", () => {
    const payload = basePayload({
      variants: [{ ...basePayload().variants[0], code: "MF-7284" }],
    });
    const result = saveProductVariantsPayloadSchema.safeParse(payload);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal("code" in result.data.variants[0], false);
    }
  });

  it("cada variante de um conjunto com 2+ cores precisa da própria client_key, mesmo exigindo cor em todas", () => {
    const payload = basePayload({
      variants: [
        { ...basePayload().variants[0], client_key: "key-a", color_id: "11111111-1111-4111-8111-111111111112" },
        {
          id: null,
          client_key: "key-b",
          color_id: "11111111-1111-4111-8111-111111111113",
          status: "ACTIVE",
          featured: false,
          slug: "vestido-floral-vermelho",
          sizes: ["P"],
          images: [],
        },
      ],
    });
    const result = saveProductVariantsPayloadSchema.safeParse(payload);
    assert.equal(result.success, true);
    if (result.success) {
      assert.deepEqual(result.data.variants.map((v) => v.client_key), ["key-a", "key-b"]);
    }
  });
});
