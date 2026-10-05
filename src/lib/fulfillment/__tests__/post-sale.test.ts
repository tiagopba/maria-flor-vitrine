import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CORREIOS_TRACKING_URL,
  GOOGLE_REVIEW_URL,
  JT_TRACKING_URL,
  POST_SALE_AUDIT_ACTIONS,
  buildDeliveryConfirmationMessage,
  buildGoogleReviewMessage,
  buildTrackingMessage,
  derivePostSaleState,
  greetingName,
  planPostSaleEvent,
  postSaleAvailability,
  trackingCarrier,
  whatsappUrl,
  type PostSaleEvent,
} from "../post-sale.ts";

const JT = { customerName: "NEUSA CARDIM", carrier: "J&T Express", service: null, trackingCode: "888100002197060" };
const CORREIOS = { customerName: "NEUSA CARDIM", carrier: "Correios", service: "SEDEX", trackingCode: "AD981445191BR" };

describe("mensagem de rastreio", () => {
  it("J&T: cliente, transportadora, código e link oficial, no modelo pedido", () => {
    const text = buildTrackingMessage(JT)!;
    assert.equal(
      text,
      [
        "Olá, Neusa Cardim",
        "Seu pedido já foi enviado pela transportadora J&T Express 📦✨",
        "Aqui está o seu código de rastreio:",
        "888100002197060",
        "📦 Você pode acompanhar a entrega pelo site:",
        JT_TRACKING_URL,
        "Obrigada por comprar com a Maria Flor 🌷",
        "Esperamos que você ame suas peças! 💛",
      ].join("\n")
    );
  });

  it("Correios: 'pelos Correios', serviço quando existe e link dos Correios", () => {
    const text = buildTrackingMessage(CORREIOS)!;
    assert.match(text, /Seu pedido já foi enviado pelos Correios \(SEDEX\) 📦✨/);
    assert.match(text, /AD981445191BR/);
    assert.ok(text.includes(CORREIOS_TRACKING_URL));
    assert.ok(!text.includes("J&T"));
  });

  it("Correios sem serviço: mesma frase, sem parênteses", () => {
    const text = buildTrackingMessage({ ...CORREIOS, service: null })!;
    assert.match(text, /pelos Correios 📦✨/);
  });

  it("sem código ou transportadora sem mensagem definida → nada é montado", () => {
    assert.equal(buildTrackingMessage({ ...JT, trackingCode: null }), null);
    assert.equal(buildTrackingMessage({ ...JT, carrier: "Jadlog" }), null);
  });

  it("reconhece a transportadora pelo nome normalizado", () => {
    assert.equal(trackingCarrier("J&T Express"), "jt");
    assert.equal(trackingCarrier("correios"), "correios");
    assert.equal(trackingCarrier("Loggi"), null);
    assert.equal(trackingCarrier(null), null);
  });
});

describe("mensagens de entrega e avaliação", () => {
  it("confirmação de entrega: texto do pedido, sem link", () => {
    const text = buildDeliveryConfirmationMessage("NEUSA CARDIM");
    assert.equal(
      text,
      [
        "Olá, Neusa Cardim! 💕",
        "Passando para confirmar se o seu pedido da Maria Flor chegou tudo certinho. 📦✨",
        "Deu tudo certo com a entrega e com as peças? 🥰",
        "Se precisar de qualquer ajuda, estamos por aqui!",
        "Muito obrigada por comprar com a Maria Flor 🌷",
      ].join("\n")
    );
  });

  it("avaliação Google: texto do pedido com o link oficial de avaliação", () => {
    const text = buildGoogleReviewMessage("NEUSA CARDIM");
    assert.ok(text.endsWith(GOOGLE_REVIEW_URL));
    assert.match(text, /⭐⭐⭐⭐⭐/);
    assert.match(text, /Muito obrigada pela confiança e preferência! 🛍️✨/);
  });

  it("saudação em caixa de título, com conectivos minúsculos", () => {
    assert.equal(greetingName("  MARIA DA SILVA   DE SOUZA "), "Maria da Silva de Souza");
  });
});

describe("WhatsApp: sem número não há link; com número usa api.whatsapp.com", () => {
  it("sem WhatsApp cadastrado → link nulo (a UI oferece só copiar)", () => {
    assert.equal(whatsappUrl(null, "oi"), null);
    assert.equal(whatsappUrl("", "oi"), null);
    assert.equal(whatsappUrl("123", "oi"), null);
  });

  it("com número → api.whatsapp.com/send com o texto codificado", () => {
    const url = whatsappUrl("(67) 99999-0000", "Olá & tchau")!;
    assert.equal(url, "https://api.whatsapp.com/send?phone=5567999990000&text=Ol%C3%A1%20%26%20tchau");
    assert.ok(!url.includes("wa.me"));
  });
});

describe("liberação das ações", () => {
  const base = { carrier: "J&T Express", trackingCode: "888100002197060" };

  it("avaliação Google só com DELIVERED", () => {
    assert.equal(postSaleAvailability({ ...base, deliveryStatus: "IN_TRANSIT" }).review.enabled, false);
    assert.equal(postSaleAvailability({ ...base, deliveryStatus: "DELIVERED" }).review.enabled, true);
  });

  it("confirmação de entrega: em trânsito ou entregue", () => {
    assert.equal(postSaleAvailability({ ...base, deliveryStatus: "PENDING" }).delivery.enabled, false);
    assert.equal(postSaleAvailability({ ...base, deliveryStatus: "IN_TRANSIT" }).delivery.enabled, true);
    assert.equal(postSaleAvailability({ ...base, deliveryStatus: "DELIVERED" }).delivery.enabled, true);
  });

  it("rastreio: exige código, transportadora suportada e envio", () => {
    assert.equal(postSaleAvailability({ ...base, deliveryStatus: "PENDING" }).tracking.enabled, false);
    assert.equal(postSaleAvailability({ ...base, trackingCode: null, deliveryStatus: "IN_TRANSIT" }).tracking.enabled, false);
    assert.equal(postSaleAvailability({ ...base, carrier: "Loggi", deliveryStatus: "IN_TRANSIT" }).tracking.enabled, false);
    assert.equal(postSaleAvailability({ ...base, deliveryStatus: "IN_TRANSIT" }).tracking.enabled, true);
  });
});

describe("estado derivado da auditoria (sem coluna nova)", () => {
  const ev = (action: string, created_at: string, actor_name = "Mayra"): PostSaleEvent => ({ action, created_at, actor_name });

  it("sem eventos → 'Ainda não enviada'", () => {
    assert.equal(derivePostSaleState([], "tracking").state, "none");
  });

  it("OPENED NÃO vira CONFIRMED sozinho: fica 'WhatsApp aberto, envio ainda não confirmado'", () => {
    const s = derivePostSaleState([ev("TRACKING_WHATSAPP_OPENED", "2026-10-05T19:43:00Z")], "tracking");
    assert.equal(s.state, "opened");
    assert.equal(s.confirmed, null);
  });

  it("CONFIRMED depois de OPENED vira 'enviado' com data e usuário", () => {
    const s = derivePostSaleState(
      [ev("TRACKING_WHATSAPP_OPENED", "2026-10-05T19:40:00Z"), ev("TRACKING_MESSAGE_CONFIRMED", "2026-10-05T19:43:00Z", "Mayra")],
      "tracking"
    );
    assert.equal(s.state, "confirmed");
    assert.equal(s.confirmed?.actor_name, "Mayra");
  });

  it("reabrir depois de confirmar volta a 'aberto' (novo envio ainda não confirmado)", () => {
    const s = derivePostSaleState(
      [ev("TRACKING_MESSAGE_CONFIRMED", "2026-10-05T19:43:00Z"), ev("TRACKING_WHATSAPP_OPENED", "2026-10-06T10:00:00Z")],
      "tracking"
    );
    assert.equal(s.state, "opened");
  });

  it("cada tipo de ação é independente dos outros", () => {
    const s = derivePostSaleState([ev("GOOGLE_REVIEW_CONFIRMED", "2026-10-05T19:43:00Z")], "delivery");
    assert.equal(s.state, "none");
    assert.equal(derivePostSaleState([ev("GOOGLE_REVIEW_CONFIRMED", "2026-10-05T19:43:00Z")], "review").state, "confirmed");
  });

  it("eventos de outras ações do módulo são ignorados", () => {
    assert.equal(derivePostSaleState([ev("DELIVERY_UPDATED", "2026-10-05T19:43:00Z")], "tracking").state, "none");
  });
});

describe("registro do clique: ABRIR registra OPENED, CONFIRMAR exige ABRIR antes", () => {
  const enabled = { enabled: true, reason: null };
  const disabled = { enabled: false, reason: "Liberada depois da entrega (status Entregue)." };

  it("ABRIR registra apenas a ação OPENED", () => {
    assert.deepEqual(planPostSaleEvent({ kind: "tracking", phase: "opened", availability: enabled, state: "none" }), {
      ok: true,
      action: "TRACKING_WHATSAPP_OPENED",
    });
  });

  it("CONFIRMAR sem ABRIR antes é recusado (nunca confirma sozinho)", () => {
    const plan = planPostSaleEvent({ kind: "delivery", phase: "confirmed", availability: enabled, state: "none" });
    assert.equal(plan.ok, false);
  });

  it("CONFIRMAR depois de ABRIR registra CONFIRMED da ação certa", () => {
    assert.deepEqual(planPostSaleEvent({ kind: "review", phase: "confirmed", availability: enabled, state: "opened" }), {
      ok: true,
      action: "GOOGLE_REVIEW_CONFIRMED",
    });
  });

  it("ação indisponível não registra nada, com o motivo", () => {
    const plan = planPostSaleEvent({ kind: "review", phase: "opened", availability: disabled, state: "none" });
    assert.deepEqual(plan, { ok: false, error: "Liberada depois da entrega (status Entregue)." });
  });
});

describe("auditoria: constraint ampliada e nomes fixos", () => {
  it("contém exatamente os 6 nomes pedidos", () => {
    assert.deepEqual(
      [...POST_SALE_AUDIT_ACTIONS].sort(),
      [
        "DELIVERY_CONFIRMATION_CONFIRMED",
        "DELIVERY_CONFIRMATION_WHATSAPP_OPENED",
        "GOOGLE_REVIEW_CONFIRMED",
        "GOOGLE_REVIEW_WHATSAPP_OPENED",
        "TRACKING_MESSAGE_CONFIRMED",
        "TRACKING_WHATSAPP_OPENED",
      ]
    );
  });
});

describe("reenvio: novo ciclo, nova confirmação, histórico preservado", () => {
  const enabled = { enabled: true, reason: null };
  const ev = (action: string, created_at: string, actor_name = "Mayra"): PostSaleEvent => ({ action, created_at, actor_name });

  it("depois de CONFIRMED, ABRIR de novo é permitido e volta a exigir confirmação", () => {
    const history = [
      ev("TRACKING_WHATSAPP_OPENED", "2026-10-05T19:40:00Z"),
      ev("TRACKING_MESSAGE_CONFIRMED", "2026-10-05T19:43:00Z"),
    ];
    assert.equal(derivePostSaleState(history, "tracking").state, "confirmed");

    const reopen = planPostSaleEvent({ kind: "tracking", phase: "opened", availability: enabled, state: "confirmed" });
    assert.deepEqual(reopen, { ok: true, action: "TRACKING_WHATSAPP_OPENED" });

    const afterReopen = [...history, ev("TRACKING_WHATSAPP_OPENED", "2026-10-06T10:00:00Z")];
    const state = derivePostSaleState(afterReopen, "tracking");
    assert.equal(state.state, "opened");
    assert.equal(planPostSaleEvent({ kind: "tracking", phase: "confirmed", availability: enabled, state: state.state }).ok, true);
  });

  it("o histórico anterior não é sobrescrito: a última confirmação continua visível", () => {
    const afterReopen = [
      ev("TRACKING_MESSAGE_CONFIRMED", "2026-10-05T19:43:00Z", "Mayra"),
      ev("TRACKING_WHATSAPP_OPENED", "2026-10-06T10:00:00Z", "Lidiane"),
    ];
    const state = derivePostSaleState(afterReopen, "tracking");
    assert.equal(state.confirmed?.actor_name, "Mayra");
    assert.equal(state.opened?.actor_name, "Lidiane");
  });
});
