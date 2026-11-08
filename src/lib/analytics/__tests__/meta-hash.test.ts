import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { describe, it } from "node:test";
import { hashEmail, hashExternalId, hashFullNameParts } from "../meta-hash.ts";

/**
 * Reimplementação mínima e independente da normalização (trim + lowercase)
 * + SHA-256 exigida pela Meta — usada só como oráculo nestes testes, nunca
 * importada do módulo testado, pra garantir que estamos checando o
 * COMPORTAMENTO (regra de normalização certa), não só "deu o mesmo valor
 * que o próprio código produziria de qualquer jeito".
 */
function expectedHash(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase(), "utf8").digest("hex");
}

describe("hashEmail", () => {
  it("normaliza (trim + lowercase) antes de hashear — mesmo e-mail em formatos diferentes bate", () => {
    const a = hashEmail("Teste@Exemplo.com");
    const b = hashEmail("  teste@exemplo.com  ");
    assert.equal(a, b);
    assert.equal(a, expectedHash("teste@exemplo.com"));
  });

  it("nunca manda o valor cru — devolve um hex de 64 caracteres (SHA-256)", () => {
    const hash = hashEmail("cliente@maria-flor.com.br");
    assert.match(hash, /^[0-9a-f]{64}$/);
    assert.notEqual(hash, "cliente@maria-flor.com.br");
  });

  it("e-mails diferentes produzem hashes diferentes", () => {
    assert.notEqual(hashEmail("a@exemplo.com"), hashEmail("b@exemplo.com"));
  });
});

describe("hashExternalId", () => {
  it("é estável — o mesmo session_id sempre produz o mesmo external_id (consistência entre eventos)", () => {
    const sessionId = "c3ab851f-f6c0-43e9-a88d-dcca42675548";
    assert.equal(hashExternalId(sessionId), hashExternalId(sessionId));
    assert.equal(hashExternalId(sessionId), expectedHash(sessionId));
  });

  it("session_ids diferentes nunca colidem em hashes iguais (identificadores distintos continuam distintos)", () => {
    assert.notEqual(
      hashExternalId("11111111-1111-4111-8111-111111111111"),
      hashExternalId("22222222-2222-4222-8222-222222222222")
    );
  });
});

describe("hashFullNameParts", () => {
  it("primeiro nome vira fn, resto vira ln", () => {
    const { fn, ln } = hashFullNameParts("Maria Flor Silva");
    assert.equal(fn, expectedHash("Maria"));
    assert.equal(ln, expectedHash("Flor Silva"));
  });

  it("nome com uma palavra só vira fn; ln nunca é inventado", () => {
    const { fn, ln } = hashFullNameParts("Maria");
    assert.equal(fn, expectedHash("Maria"));
    assert.equal(ln, undefined);
  });

  it("nome vazio/só espaço não inventa fn/ln — devolve objeto vazio", () => {
    assert.deepEqual(hashFullNameParts(""), {});
    assert.deepEqual(hashFullNameParts("   "), {});
  });

  it("espaços duplicados/maiúsculas não mudam o resultado (mesma normalização de hashEmail)", () => {
    const a = hashFullNameParts("maria flor");
    const b = hashFullNameParts("  MARIA   FLOR  ");
    assert.equal(a.fn, b.fn);
    assert.equal(a.ln, b.ln);
  });
});
