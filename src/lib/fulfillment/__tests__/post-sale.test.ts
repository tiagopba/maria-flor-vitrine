import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CORREIOS_TRACKING_URL,
  FOLLOWUP_TYPES,
  FOLLOWUP_TYPE_BY_KIND,
  GOOGLE_REVIEW_URL,
  JT_TRACKING_URL,
  KIND_BY_FOLLOWUP_TYPE,
  POST_SALE_AUDIT_ACTIONS,
  POST_SALE_KINDS,
  buildDeliveryConfirmationMessage,
  buildGoogleReviewMessage,
  buildShippingNoticeMessage,
  derivePostSaleState,
  planPostSaleEvent,
  postSaleAvailability,
  trackingCarrier,
  whatsappUrl,
  type FollowupRow,
  type OpenedEvent,
  type PostSaleKind,
} from "../post-sale.ts";

const JT = { customerName: "NEUSA CARDIM", carrier: "J&T Express", service: null, trackingCode: "888100002197060" };
const CORREIOS = { customerName: "NEUSA CARDIM", carrier: "Correios", service: "SEDEX", trackingCode: "AD981445191BR" };

const openFollowup = (overrides: Partial<FollowupRow> = {}): FollowupRow => ({
  type: "SHIPPING_NOTICE",
  status: "OPEN",
  sent_at: null,
  sent_by_name: null,
  message_snapshot: null,
  ...overrides,
});
const sentFollowup = (overrides: Partial<FollowupRow> = {}): FollowupRow => ({
  type: "SHIPPING_NOTICE",
  status: "SENT",
  sent_at: "2026-10-07T14:09:01.871090+00:00",
  sent_by_name: "Mayra",
  message_snapshot: "texto confirmado",
  ...overrides,
});
const opened = (created_at: string, actor_name: string | null = "Mayra"): OpenedEvent => ({ created_at, actor_name });

describe("mensagem de aviso de envio", () => {
  it("J&T: link oficial é o site institucional, nunca o antigo /trajectoryQuery", () => {
    assert.equal(JT_TRACKING_URL, "https://www.jtexpress.com.br");
    assert.ok(!JT_TRACKING_URL.includes("trajectoryQuery"));
  });

  it("J&T: tom natural, transportadora, código e link oficial", () => {
    const text = buildShippingNoticeMessage(JT)!;
    assert.equal(
      text,
      [
        "Oi, Neusa! 💗",
        "Passando pra avisar que seu pedido já saiu daqui e está a caminho 😊",
        "",
        "A entrega será feita pela J&T Express.",
        "Seu código de rastreio é:",
        "888100002197060",
        "",
        "Você consegue acompanhar por aqui:",
        JT_TRACKING_URL,
        "",
        "Qualquer dúvida durante a entrega, pode me chamar por aqui, tá? 🥰",
      ].join("\n")
    );
  });

  it("Correios: nome da transportadora com o serviço entre parênteses, e o link dos Correios", () => {
    const text = buildShippingNoticeMessage(CORREIOS)!;
    assert.match(text, /A entrega será feita pela Correios \(SEDEX\)\./);
    assert.match(text, /AD981445191BR/);
    assert.ok(text.includes(CORREIOS_TRACKING_URL));
    assert.ok(!text.includes("J&T"));
  });

  it("Correios sem serviço: nome da transportadora sem parênteses", () => {
    const text = buildShippingNoticeMessage({ ...CORREIOS, service: null })!;
    assert.match(text, /A entrega será feita pela Correios\./);
  });

  it("sem código ou transportadora sem mensagem definida → nada é montado", () => {
    assert.equal(buildShippingNoticeMessage({ ...JT, trackingCode: null }), null);
    assert.equal(buildShippingNoticeMessage({ ...JT, carrier: "Jadlog" }), null);
  });

  it("reconhece a transportadora pelo nome normalizado", () => {
    assert.equal(trackingCarrier("J&T Express"), "jt");
    assert.equal(trackingCarrier("correios"), "correios");
    assert.equal(trackingCarrier("Loggi"), null);
    assert.equal(trackingCarrier(null), null);
  });

  it("não usa o tom publicitário antigo", () => {
    const text = buildShippingNoticeMessage(JT)!;
    assert.ok(!text.includes("Esperamos que você ame"));
  });
});

describe("mensagens de entrega e avaliação: tom de pessoa, não de propaganda", () => {
  it("confirmação de entrega: pergunta direta, sem frase robótica", () => {
    const text = buildDeliveryConfirmationMessage("NEUSA CARDIM");
    assert.equal(
      text,
      [
        "Oi, Neusa! 💗",
        "Vi que seu pedido foi entregue e vim saber se chegou tudo certinho por aí 😊",
        "",
        "Deu tudo certo com as peças? Você gostou?",
        "Quando puder, me conta por aqui 🥰",
      ].join("\n")
    );
    assert.ok(!text.includes("Passando para confirmar se o seu pedido"));
  });

  it("avaliação Google: abertura sempre neutra (o sistema não guarda satisfação da cliente)", () => {
    const text = buildGoogleReviewMessage("NEUSA CARDIM");
    assert.ok(text.startsWith("Oi, Neusa! 💗\nEspero que tenha dado tudo certo com seu pedido."));
    assert.ok(!text.includes("que bom que"));
    assert.ok(text.includes(GOOGLE_REVIEW_URL));
  });

  it("cumprimenta só pelo primeiro nome, nunca pelo sobrenome", () => {
    assert.ok(!buildGoogleReviewMessage("NEUSA CARDIM").includes("Cardim"));
    assert.ok(!buildDeliveryConfirmationMessage("ROSIANE IANEL JOAQUIM DE SOUZA").includes("Ianel"));
  });

  it("nome vazio → saudação segura, sem 'undefined'", () => {
    assert.ok(buildGoogleReviewMessage("   ").startsWith("Oi!"));
    assert.ok(!buildDeliveryConfirmationMessage("").includes("undefined"));
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

describe("liberação das ações (não muda com follow-up)", () => {
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

  it("aviso de envio: exige código, transportadora suportada e envio", () => {
    assert.equal(postSaleAvailability({ ...base, deliveryStatus: "PENDING" }).tracking.enabled, false);
    assert.equal(postSaleAvailability({ ...base, trackingCode: null, deliveryStatus: "IN_TRANSIT" }).tracking.enabled, false);
    assert.equal(postSaleAvailability({ ...base, carrier: "Loggi", deliveryStatus: "IN_TRANSIT" }).tracking.enabled, false);
    assert.equal(postSaleAvailability({ ...base, deliveryStatus: "IN_TRANSIT" }).tracking.enabled, true);
  });

  it("não marca nada como enviado automaticamente por a transportadora estar DELIVERED — isso é follow-up, não status de entrega", () => {
    const avail = postSaleAvailability({ ...base, deliveryStatus: "DELIVERED" });
    assert.equal(avail.delivery.enabled, true); // disponível ≠ enviado
    assert.equal(avail.review.enabled, true);
  });
});

describe("tipos de follow-up: nomes estáveis e correspondência 1:1 com kind", () => {
  it("os três tipos pedidos", () => {
    assert.deepEqual([...FOLLOWUP_TYPES].sort(), ["DELIVERY_CONFIRMATION", "GOOGLE_REVIEW", "SHIPPING_NOTICE"]);
  });

  it("a volta kind → type → kind é sempre a mesma", () => {
    for (const kind of POST_SALE_KINDS) assert.equal(KIND_BY_FOLLOWUP_TYPE[FOLLOWUP_TYPE_BY_KIND[kind]], kind);
  });
});

describe("estado do follow-up: a linha de fulfillment_followups decide, não o clique", () => {
  it("sem linha (não deveria faltar, mas por segurança) e sem clique → OPEN, 'ainda não enviada'", () => {
    const s = derivePostSaleState(openFollowup(), []);
    assert.equal(s.status, "OPEN");
    assert.equal(s.hasOpenedBefore, false);
    assert.equal(s.openedAt, null);
  });

  it("ABRIR grava só no histórico: status continua OPEN, mas já libera CONFIRMAR", () => {
    const s = derivePostSaleState(openFollowup(), [opened("2026-10-05T19:43:00Z")]);
    assert.equal(s.status, "OPEN");
    assert.equal(s.hasOpenedBefore, true);
    assert.equal(s.openedAt, "2026-10-05T19:43:00Z");
  });

  it("COPIAR não grava nada na trilha: o estado não muda (não há ação de copiar a registrar)", () => {
    // Não existe fase "copiar": o helper nem recebe isso. O teste de segurança confirma
    // que o botão de copiar não chama registerPostSaleEvent.
    assert.equal(derivePostSaleState(openFollowup(), []).status, "OPEN");
  });

  it("SENT vem só da linha do banco, com data, quem confirmou e o texto exato", () => {
    const s = derivePostSaleState(sentFollowup(), [opened("2026-10-05T19:40:00Z")]);
    assert.equal(s.status, "SENT");
    assert.equal(s.sentAt, "2026-10-07T14:09:01.871090+00:00");
    assert.equal(s.sentByName, "Mayra");
    assert.equal(s.messageSnapshot, "texto confirmado");
    // Enquanto SENT, a sub-informação de "abriu" não é mais mostrada.
    assert.equal(s.openedAt, null);
  });

  it("follow-up antigo confirmado sem snapshot: SENT, mas messageSnapshot é null (nunca inventado)", () => {
    const s = derivePostSaleState(sentFollowup({ message_snapshot: null }), []);
    assert.equal(s.status, "SENT");
    assert.equal(s.messageSnapshot, null);
  });

  it("reabrir depois de SENT (reenviar) continua marcado como enviado: não existe 'abrir de novo' como estado", () => {
    const s = derivePostSaleState(sentFollowup(), [opened("2026-10-07T15:00:00Z")]);
    assert.equal(s.status, "SENT");
    assert.equal(s.sentAt, "2026-10-07T14:09:01.871090+00:00", "sent_at não muda com o reenvio");
  });

  it("cada tipo de follow-up é independente: usar o evento certo é responsabilidade de quem chama", () => {
    const s1 = derivePostSaleState(openFollowup({ type: "GOOGLE_REVIEW" }), []);
    assert.equal(s1.status, "OPEN");
  });

  it("COPIAR não é uma fase registrável: não existe caminho de código que leve a ela a SENT", () => {
    // COPIAR é só o botão de copiar texto (clipboard do navegador) — nunca chama
    // registerPostSaleEvent. O estado, sem nenhum evento, continua OPEN.
    assert.equal(derivePostSaleState(openFollowup(), []).status, "OPEN");
  });

  it("ABRIR WHATSAPP sozinho nunca é SENT, mesmo repetido várias vezes", () => {
    const manyOpens = [opened("2026-10-05T10:00:00Z"), opened("2026-10-06T10:00:00Z"), opened("2026-10-07T10:00:00Z")];
    const s = derivePostSaleState(openFollowup(), manyOpens);
    assert.equal(s.status, "OPEN");
    assert.equal(s.hasOpenedBefore, true);
  });

  it("snapshot novo é imutável: o estado SENT sempre devolve o texto gravado na linha, nunca recalcula", () => {
    const s = derivePostSaleState(sentFollowup({ message_snapshot: "texto A, confirmado em 07/10" }), []);
    assert.equal(s.messageSnapshot, "texto A, confirmado em 07/10");
    // Mesma linha, mesmo snapshot, de novo — não há como "recalcular" aqui: a função
    // nem recebe o texto do modelo atual como parâmetro quando o estado é SENT.
    const s2 = derivePostSaleState(sentFollowup({ message_snapshot: "texto A, confirmado em 07/10" }), [opened("2026-10-08T10:00:00Z")]);
    assert.equal(s2.messageSnapshot, "texto A, confirmado em 07/10");
  });
});

describe("plano do clique: COPIAR não existe como ação; ABRIR nunca muda status; CONFIRMAR é a única fonte da verdade", () => {
  const enabled = { enabled: true, reason: null };
  const disabled = { enabled: false, reason: "Liberada depois da entrega (status Entregue)." };

  it("ABRIR é permitido mesmo que nunca tenha sido aberto antes", () => {
    assert.deepEqual(
      planPostSaleEvent({ kind: "tracking", phase: "opened", availability: enabled, state: derivePostSaleState(openFollowup(), []) }),
      { ok: true, action: "TRACKING_WHATSAPP_OPENED" }
    );
  });

  it("ABRIR (reenviar) é permitido mesmo já SENT — é só um atalho, não desfaz o envio", () => {
    const plan = planPostSaleEvent({ kind: "tracking", phase: "opened", availability: enabled, state: derivePostSaleState(sentFollowup(), []) });
    assert.deepEqual(plan, { ok: true, action: "TRACKING_WHATSAPP_OPENED" });
  });

  it("CONFIRMAR SEM nunca ter aberto o WhatsApp por aqui é PERMITIDO: a funcionária pode ter enviado por outro caminho", () => {
    const plan = planPostSaleEvent({
      kind: "delivery",
      phase: "confirmed",
      availability: enabled,
      state: derivePostSaleState(openFollowup({ type: "DELIVERY_CONFIRMATION" }), []), // hasOpenedBefore: false
    });
    assert.deepEqual(plan, { ok: true, action: "DELIVERY_CONFIRMATION_CONFIRMED" });
  });

  it("CONFIRMAR depois de ABRIR também é permitido, com a mesma ação", () => {
    const plan = planPostSaleEvent({
      kind: "review",
      phase: "confirmed",
      availability: enabled,
      state: derivePostSaleState(openFollowup({ type: "GOOGLE_REVIEW" }), [opened("2026-10-05T19:40:00Z")]),
    });
    assert.deepEqual(plan, { ok: true, action: "GOOGLE_REVIEW_CONFIRMED" });
  });

  it("CONFIRMAR depois de só COPIAR (nenhum evento na trilha) também é permitido", () => {
    // COPIAR nem existe como fase: não há nenhum evento "opened" nem nenhuma chamada ao
    // servidor. O estado chega aqui exatamente como se nada tivesse acontecido ainda.
    const plan = planPostSaleEvent({
      kind: "tracking",
      phase: "confirmed",
      availability: enabled,
      state: derivePostSaleState(openFollowup(), []),
    });
    assert.deepEqual(plan, { ok: true, action: "TRACKING_MESSAGE_CONFIRMED" });
  });

  it("CONFIRMAR num follow-up já SENT é recusado: não cria um segundo 'envio confirmado'", () => {
    const plan = planPostSaleEvent({
      kind: "tracking",
      phase: "confirmed",
      availability: enabled,
      state: derivePostSaleState(sentFollowup(), [opened("2026-10-07T15:00:00Z")]),
    });
    assert.equal(plan.ok, false);
  });

  it("ação indisponível não registra nada, com o motivo (vale para ABRIR e para CONFIRMAR)", () => {
    const plan = planPostSaleEvent({ kind: "review", phase: "opened", availability: disabled, state: derivePostSaleState(openFollowup(), []) });
    assert.deepEqual(plan, { ok: false, error: "Liberada depois da entrega (status Entregue)." });
    const plan2 = planPostSaleEvent({ kind: "review", phase: "confirmed", availability: disabled, state: derivePostSaleState(openFollowup(), []) });
    assert.deepEqual(plan2, { ok: false, error: "Liberada depois da entrega (status Entregue)." });
  });
});

describe("auditoria: constraint ampliada e nomes fixos (sem mudança nesta rodada)", () => {
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

describe("contagem de pendências: 3 → 2 → 1 → 0", () => {
  const items = (statuses: Record<PostSaleKind, "OPEN" | "SENT">) =>
    POST_SALE_KINDS.map((kind) => derivePostSaleState(openFollowup({ type: FOLLOWUP_TYPE_BY_KIND[kind], status: statuses[kind] }), []));

  it("3 em aberto", () => {
    const count = items({ tracking: "OPEN", delivery: "OPEN", review: "OPEN" }).filter((s) => s.status !== "SENT").length;
    assert.equal(count, 3);
  });

  it("2 em aberto depois de 1 confirmado", () => {
    const count = items({ tracking: "SENT", delivery: "OPEN", review: "OPEN" }).filter((s) => s.status !== "SENT").length;
    assert.equal(count, 2);
  });

  it("1 em aberto depois de 2 confirmados", () => {
    const count = items({ tracking: "SENT", delivery: "SENT", review: "OPEN" }).filter((s) => s.status !== "SENT").length;
    assert.equal(count, 1);
  });

  it("0 em aberto (concluídos) depois dos 3 confirmados", () => {
    const count = items({ tracking: "SENT", delivery: "SENT", review: "SENT" }).filter((s) => s.status !== "SENT").length;
    assert.equal(count, 0);
  });

  it("a contagem não muda com cliques de ABRIR: só fulfillment_followups.status decide", () => {
    const withoutOpens = derivePostSaleState(openFollowup(), []).status;
    const withManyOpens = derivePostSaleState(openFollowup(), [
      opened("2026-10-05T10:00:00Z"),
      opened("2026-10-06T10:00:00Z"),
      opened("2026-10-07T10:00:00Z"),
    ]).status;
    assert.equal(withoutOpens, "OPEN");
    assert.equal(withManyOpens, "OPEN");
    assert.equal(withoutOpens, withManyOpens);
  });
});
