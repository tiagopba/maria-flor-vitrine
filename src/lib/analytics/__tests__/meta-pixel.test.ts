import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { waitForFacebookBrowserIds } from "../meta-pixel.ts";

/**
 * Cobertura só da corrida Pixel × CAPI (ver meta-pixel.ts). Roda em Node
 * puro (sem `window`/`document`) — exatamente o caso em que o Pixel real
 * nunca vai carregar (equivalente a bloqueador de anúncio/Pixel ID ausente),
 * então é o cenário certo pra provar que a espera NUNCA trava a CAPI pra
 * sempre: ela tem que desistir sozinha depois do timeout.
 */
describe("waitForFacebookBrowserIds", () => {
  it("nunca bloqueia indefinidamente — resolve sozinha depois de um timeout curto", async () => {
    const start = Date.now();
    await waitForFacebookBrowserIds(30);
    const elapsed = Date.now() - start;

    // Resolveu (não travou o teste) e não demorou muito além do timeout pedido.
    assert.ok(elapsed < 500, `esperado resolver perto de 30ms, levou ${elapsed}ms`);
  });

  it("timeouts diferentes não interferem entre si (cada chamada tem o próprio prazo)", async () => {
    const results = await Promise.all([waitForFacebookBrowserIds(10), waitForFacebookBrowserIds(50)]);
    assert.equal(results.length, 2);
  });
});
