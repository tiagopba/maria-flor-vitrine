// Regressão: overrideCode (FieldResult) precisa sobreviver a TODO o pipeline
// de persistência da conferência — não só ao conferirXml() puro (já coberto
// em conferir-xml.test.ts). Reproduz, sem banco e sem a Tatiane real, os
// mesmos passos de startConferenciaAction() (gravação) e da leitura em
// page.tsx/ConferenciaPanel.tsx (exibição), com a fixture sintética
// NFE_XML_1220_TATIANE (mesmos valores do caso real, cliente fictícia).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { NFE_XML_1220_TATIANE } from "../../fulfillment/__tests__/fixtures.ts";
import { parseNfeXml } from "../../fulfillment/parse-nfe-xml.ts";
import { conferirXml } from "../conferir-xml.ts";
import type { ExpectedData } from "../conferir.ts";

const EXPECTED: ExpectedData = {
  customerName: "MARIA DA SILVA EXEMPLO",
  cpf: "11144477735",
  address: {
    street: "Avenida Brasil",
    number: "1500",
    complement: "APTO 12 B",
    neighborhood: "Bairro Diferente Da Cliente",
    city: "Sao Paulo",
    state: "SP",
    postalCode: "01310100",
  },
  recipientName: "MARIA DA SILVA EXEMPLO",
  saleTotal: 173.99,
  legacyFreightOverrideActive: true,
};

function parsedTatianeXml() {
  const result = parseNfeXml(NFE_XML_1220_TATIANE);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("fixture inválida");
  return result.data;
}

describe("overrideCode sobrevive a todo o pipeline (gravação → leitura → UI), sem usar a Tatiane real", () => {
  it("conferirXml já devolve overrideCode no campo valor (base do pipeline)", () => {
    const outcome = conferirXml({ expected: EXPECTED, xml: parsedTatianeXml() });
    const valor = outcome.results.find((r) => r.field === "valor");
    assert.equal(valor?.verdict, "OK");
    assert.equal(valor?.overrideCode, "LEGACY_FREIGHT_NOT_INCLUDED_IN_NFE");
  });

  it("gravação (mesmo formato de startConferenciaAction) + round-trip de jsonb preserva overrideCode", () => {
    const outcome = conferirXml({ expected: EXPECTED, xml: parsedTatianeXml() });

    // Exatamente o que conferencia-actions.ts grava em `comparison` — sem
    // reduzir FieldResult campo a campo (isso foi a causa do bug: um
    // .map(({field, verdict, reason}) => ...) antigo descartava overrideCode).
    const comparisonToStore = { results: outcome.results, extracted: outcome.extracted };

    // Simula ida e volta por jsonb (Postgres/PostgREST serializam como JSON).
    const comparisonReadBack = JSON.parse(JSON.stringify(comparisonToStore)) as typeof comparisonToStore;

    const valor = comparisonReadBack.results.find((r) => r.field === "valor");
    assert.equal(valor?.verdict, "OK");
    assert.equal(valor?.overrideCode, "LEGACY_FREIGHT_NOT_INCLUDED_IN_NFE");
    assert.match(valor?.reason ?? "", /frete legado/i);

    // Mapeamento de leitura usado em page.tsx: `results: c.results ?? []` —
    // passthrough direto, sem filtrar chaves.
    const attemptViewResults = comparisonReadBack.results ?? [];
    assert.deepEqual(
      attemptViewResults.find((r) => r.field === "valor"),
      valor
    );
  });

  it("UI (ConferenciaPanel): overrideNotices identifica pelo overrideCode estruturado, nunca pelo texto de reason", () => {
    const outcome = conferirXml({ expected: EXPECTED, xml: parsedTatianeXml() });
    const comparisonReadBack = JSON.parse(
      JSON.stringify({ results: outcome.results, extracted: outcome.extracted })
    ) as { results: typeof outcome.results };

    // Mesmo filtro de ConferenciaPanel.tsx: `latest.results.filter((r) => r.overrideCode)`.
    const overrideNotices = comparisonReadBack.results.filter((r) => r.overrideCode);
    assert.equal(overrideNotices.length, 1);
    assert.equal(overrideNotices[0].field, "valor");
    assert.equal(overrideNotices[0].overrideCode, "LEGACY_FREIGHT_NOT_INCLUDED_IN_NFE");

    // Nenhum outro campo ganhou o badge — mesmo com bairro divergente em REVIEW.
    for (const r of comparisonReadBack.results) {
      if (r.field !== "valor") assert.equal(r.overrideCode, undefined, `${r.field} não deveria ter overrideCode`);
    }
  });

  it("sem checkbox para 'valor': reviewFields (o que a tela lista pra marcar) nunca inclui o campo perdoado pelo override", () => {
    const outcome = conferirXml({ expected: EXPECTED, xml: parsedTatianeXml() });
    assert.equal(outcome.verdict, "REVIEW");
    assert.ok(outcome.reviewFields.includes("bairro"));
    assert.ok(!outcome.reviewFields.includes("valor"));
  });
});
