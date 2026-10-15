import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { trackingInfoSchema } from "../schema.ts";

describe("trackingInfoSchema: SALVAR RASTREAMENTO", () => {
  it("aceita J&T Express ou Correios + código válido", () => {
    const jt = trackingInfoSchema.safeParse({ carrier: "J&T Express", trackingCode: "888100002197060" });
    assert.equal(jt.success, true);
    if (jt.success) assert.equal(jt.data.trackingCode, "888100002197060");

    const correios = trackingInfoSchema.safeParse({ carrier: "Correios", trackingCode: "AD981445191BR" });
    assert.equal(correios.success, true);
  });

  it("transportadora é obrigatória e fechada: nunca aceita texto livre nem transportadora inventada", () => {
    assert.equal(trackingInfoSchema.safeParse({ carrier: "", trackingCode: "888100002197060" }).success, false);
    assert.equal(trackingInfoSchema.safeParse({ carrier: "Jadlog", trackingCode: "888100002197060" }).success, false);
    assert.equal(trackingInfoSchema.safeParse({ trackingCode: "888100002197060" }).success, false);
  });

  it("código de rastreamento é obrigatório, mesmo com transportadora válida", () => {
    assert.equal(trackingInfoSchema.safeParse({ carrier: "J&T Express", trackingCode: "" }).success, false);
    assert.equal(trackingInfoSchema.safeParse({ carrier: "J&T Express", trackingCode: "   " }).success, false);
    assert.equal(trackingInfoSchema.safeParse({ carrier: "J&T Express" }).success, false);
  });

  it("Correios exige o formato oficial (2 letras + 9 dígitos + BR) — J&T não tem essa exigência", () => {
    const badCorreios = trackingInfoSchema.safeParse({ carrier: "Correios", trackingCode: "888100002197060" });
    assert.equal(badCorreios.success, false);
    if (!badCorreios.success) assert.match(badCorreios.error.flatten().fieldErrors.trackingCode?.[0] ?? "", /Correios/);

    // Mesmo formato do Correios não é recusado para J&T (não há exigência de padrão lá).
    const jtAnyFormat = trackingInfoSchema.safeParse({ carrier: "J&T Express", trackingCode: "AD981445191BR" });
    assert.equal(jtAnyFormat.success, true);
  });

  it("normaliza o código: remove espaços e maiuscula", () => {
    const parsed = trackingInfoSchema.safeParse({ carrier: "J&T Express", trackingCode: " 888 100 002 ab " });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.trackingCode, "888100002AB");
  });
});
