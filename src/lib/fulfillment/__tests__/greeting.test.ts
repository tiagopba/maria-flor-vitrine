import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { customerFirstName, greetingHello } from "../greeting.ts";
import { buildDeliveryConfirmationMessage, buildGoogleReviewMessage, buildTrackingMessage } from "../post-sale.ts";
import { buildIntakeLinkMessage } from "../../intake/messages.ts";

describe("customerFirstName: só o primeiro nome", () => {
  it("nome completo → primeiro nome", () => {
    assert.equal(customerFirstName("Rosiane Ianel Joaquim de Souza"), "Rosiane");
  });

  it("caixa alta é normalizada", () => {
    assert.equal(customerFirstName("NEUSA CARDIM"), "Neusa");
  });

  it("espaços extras no começo, no meio e no fim não causam erro", () => {
    assert.equal(customerFirstName("   Maria    Aparecida   "), "Maria");
    assert.equal(customerFirstName("\tAna Paula"), "Ana");
  });

  it("nome de uma palavra", () => {
    assert.equal(customerFirstName("Lidiane"), "Lidiane");
  });

  it("nome vazio, só espaços ou ausente → null", () => {
    assert.equal(customerFirstName(""), null);
    assert.equal(customerFirstName("   "), null);
    assert.equal(customerFirstName(null), null);
    assert.equal(customerFirstName(undefined), null);
  });

  it("token sem letra é ignorado: pega a primeira palavra válida", () => {
    assert.equal(customerFirstName("123 - Ana Paula"), "Ana");
  });

  it("acento preservado", () => {
    assert.equal(customerFirstName("JOÃO da Silva"), "João");
  });
});

describe("greetingHello: fallback seguro", () => {
  it("com nome → 'Olá, Primeiro'", () => {
    assert.equal(greetingHello("Ana Paula"), "Olá, Ana");
  });

  it("sem nome válido → 'Olá' (nunca 'undefined')", () => {
    assert.equal(greetingHello(""), "Olá");
    assert.equal(greetingHello(null), "Olá");
  });
});

describe("mensagens de WhatsApp usam o primeiro nome", () => {
  const JT = { customerName: "ROSIANE IANEL JOAQUIM DE SOUZA", carrier: "J&T Express", service: null, trackingCode: "888100005315635" };
  const CORREIOS = { customerName: "ROSIANE IANEL JOAQUIM DE SOUZA", carrier: "Correios", service: "SEDEX", trackingCode: "AD981445191BR" };

  it("aviso de envio J&T: primeiro nome", () => {
    assert.ok(buildTrackingMessage(JT)!.startsWith("Oi, Rosiane! 💗\n"));
  });

  it("aviso de envio Correios: primeiro nome", () => {
    assert.ok(buildTrackingMessage(CORREIOS)!.startsWith("Oi, Rosiane! 💗\n"));
  });

  it("aviso de envio sem nome válido: 'Oi!' sem undefined", () => {
    const text = buildTrackingMessage({ ...JT, customerName: "  " })!;
    assert.ok(text.startsWith("Oi! 💗\n"));
    assert.ok(!text.includes("undefined"));
  });

  it("confirmação de entrega: primeiro nome", () => {
    assert.ok(buildDeliveryConfirmationMessage("ROSIANE IANEL JOAQUIM DE SOUZA").startsWith("Oi, Rosiane! 💗\n"));
  });

  it("avaliação Google: primeiro nome", () => {
    assert.ok(buildGoogleReviewMessage("ROSIANE IANEL JOAQUIM DE SOUZA").startsWith("Oi, Rosiane! 💗\n"));
  });

  it("mensagem de coleta: primeiro nome", () => {
    assert.ok(buildIntakeLinkMessage("ROSIANE IANEL JOAQUIM DE SOUZA", "https://x.test/l").startsWith("Olá, Rosiane! 💕\n"));
  });

  it("mensagem de coleta sem nome válido: 'Olá! 💕'", () => {
    const text = buildIntakeLinkMessage("", "https://x.test/l");
    assert.ok(text.startsWith("Olá! 💕\n"));
    assert.ok(!text.includes("undefined"));
  });

  it("nenhuma saudação contém o sobrenome", () => {
    for (const text of [
      buildTrackingMessage(JT)!,
      buildDeliveryConfirmationMessage("ROSIANE IANEL JOAQUIM DE SOUZA"),
      buildGoogleReviewMessage("ROSIANE IANEL JOAQUIM DE SOUZA"),
      buildIntakeLinkMessage("ROSIANE IANEL JOAQUIM DE SOUZA", "https://x.test/l"),
    ]) {
      assert.ok(!/Ianel|Joaquim|Souza/i.test(text.split("\n")[0]), text.split("\n")[0]);
    }
  });
});
