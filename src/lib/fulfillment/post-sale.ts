// Pós-venda por WhatsApp — PURO. Monta mensagens, links e estados.
// NENHUMA mensagem é enviada aqui: o sistema só prepara o texto, abre o WhatsApp
// e registra o clique. "Enviado" só existe quando o funcionário confirma.
//
// Duas fontes, cada uma com um papel:
//  - fulfillment_followups: o estado durável (OPEN/SENT), com quem confirmou, quando,
//    e o texto exato confirmado (message_snapshot). COPIAR e ABRIR nunca mudam isto.
//  - fulfillment_audit_logs: só a trilha de "abri o WhatsApp" (sem texto, sem PII),
//    usada para a sub-mensagem "WhatsApp aberto" e para exigir abertura antes de confirmar.
import type { DeliveryStatus } from "./delivery.ts";
import { customerFirstName } from "./greeting.ts";
import { normalizeCustomerWhatsapp } from "./phone.ts";
import { normalizeForCompare } from "./text.ts";

export const POST_SALE_KINDS = ["tracking", "delivery", "review"] as const;
export type PostSaleKind = (typeof POST_SALE_KINDS)[number];
export type PostSalePhase = "opened" | "confirmed";

/** Tipo gravado em fulfillment_followups (nome estável, independente do `kind` interno). */
export const FOLLOWUP_TYPES = ["SHIPPING_NOTICE", "DELIVERY_CONFIRMATION", "GOOGLE_REVIEW"] as const;
export type FollowupType = (typeof FOLLOWUP_TYPES)[number];

export const FOLLOWUP_TYPE_BY_KIND: Record<PostSaleKind, FollowupType> = {
  tracking: "SHIPPING_NOTICE",
  delivery: "DELIVERY_CONFIRMATION",
  review: "GOOGLE_REVIEW",
};
export const KIND_BY_FOLLOWUP_TYPE: Record<FollowupType, PostSaleKind> = {
  SHIPPING_NOTICE: "tracking",
  DELIVERY_CONFIRMATION: "delivery",
  GOOGLE_REVIEW: "review",
};

/** Ações da trilha de "abri o WhatsApp" (nomes fixos; sem texto de mensagem, telefone ou CPF). */
export const POST_SALE_ACTIONS = {
  tracking: { opened: "TRACKING_WHATSAPP_OPENED", confirmed: "TRACKING_MESSAGE_CONFIRMED" },
  delivery: { opened: "DELIVERY_CONFIRMATION_WHATSAPP_OPENED", confirmed: "DELIVERY_CONFIRMATION_CONFIRMED" },
  review: { opened: "GOOGLE_REVIEW_WHATSAPP_OPENED", confirmed: "GOOGLE_REVIEW_CONFIRMED" },
} as const;

export type PostSaleAction = (typeof POST_SALE_ACTIONS)[PostSaleKind][PostSalePhase];

export const POST_SALE_AUDIT_ACTIONS: readonly PostSaleAction[] = Object.values(POST_SALE_ACTIONS).flatMap((a) => [a.opened, a.confirmed]);

export const POST_SALE_LABELS: Record<PostSaleKind, string> = {
  tracking: "Aviso de envio",
  delivery: "Confirmação de entrega",
  review: "Avaliação Google",
};

// Links oficiais. J&T e Google vêm do pedido. O de Correios NÃO estava definido no projeto:
// precisa de confirmação antes de qualquer uso real.
export const JT_TRACKING_URL = "https://www.jtexpress.com.br/trajectoryQuery";
export const CORREIOS_TRACKING_URL = "https://rastreamento.correios.com.br/app/index.php";
export const GOOGLE_REVIEW_URL = "https://g.page/r/CZ1LzmpdDum5EBM/review";

export function isPostSaleKind(value: unknown): value is PostSaleKind {
  return typeof value === "string" && (POST_SALE_KINDS as readonly string[]).includes(value);
}

export type TrackingCarrier = "jt" | "correios";

/** "J&T Express" → jt · "Correios" → correios · qualquer outra → null (sem mensagem automática). */
export function trackingCarrier(carrier: string | null | undefined): TrackingCarrier | null {
  const n = normalizeForCompare(carrier);
  if (!n) return null;
  if (n.includes("correios")) return "correios";
  if (n.startsWith("j t")) return "jt";
  return null;
}

/** "Oi, Neusa!" — nunca "Oi, undefined!". Sem nome válido: "Oi!" (nunca quebra o texto). */
function oi(customerName: string | null | undefined): string {
  const first = customerFirstName(customerName);
  return first ? `Oi, ${first}!` : "Oi!";
}

export interface TrackingMessageInput {
  customerName: string;
  carrier: string | null;
  service: string | null;
  trackingCode: string | null;
}

/**
 * Aviso de envio. Tom de mensagem escrita por uma pessoa da loja, não um texto
 * publicitário. Devolve null quando não há código ou a transportadora não tem
 * mensagem definida (a UI nem chega a mostrar o bloco de copiar/abrir nesse caso).
 */
export function buildShippingNoticeMessage(input: TrackingMessageInput): string | null {
  const carrier = trackingCarrier(input.carrier);
  const code = input.trackingCode?.trim();
  if (!carrier || !code) return null;

  const carrierName = carrier === "jt" ? "J&T Express" : input.service?.trim() ? `Correios (${input.service.trim()})` : "Correios";
  const link = carrier === "jt" ? JT_TRACKING_URL : CORREIOS_TRACKING_URL;

  return [
    `${oi(input.customerName)} 💗`,
    "Passando pra avisar que seu pedido já saiu daqui e está a caminho 😊",
    "",
    `A entrega será feita pela ${carrierName}.`,
    "Seu código de rastreio é:",
    code,
    "",
    "Você consegue acompanhar por aqui:",
    link,
    "",
    "Qualquer dúvida durante a entrega, pode me chamar por aqui, tá? 🥰",
  ].join("\n");
}

/** Mantido por compatibilidade com o nome anterior. */
export const buildTrackingMessage = buildShippingNoticeMessage;

export function buildDeliveryConfirmationMessage(customerName: string): string {
  return [
    `${oi(customerName)} 💗`,
    "Vi que seu pedido foi entregue e vim saber se chegou tudo certinho por aí 😊",
    "",
    "Deu tudo certo com as peças? Você gostou?",
    "Quando puder, me conta por aqui 🥰",
  ].join("\n");
}

/**
 * Avaliação Google. O sistema não guarda satisfação/resposta da cliente, então a
 * abertura é sempre neutra — nunca "que bom que você gostou" sem ter essa confirmação.
 */
export function buildGoogleReviewMessage(customerName: string): string {
  return [
    `${oi(customerName)} 💗`,
    "Espero que tenha dado tudo certo com seu pedido.",
    "",
    "Se você gostou do atendimento e puder deixar uma avaliação pra gente no Google, vai ajudar muito a Maria Flor 🥰",
    "É rapidinho e faz uma diferença enorme pra nossa loja.",
    "",
    GOOGLE_REVIEW_URL,
    "",
    "Obrigada pela confiança em comprar com a gente! 💗",
  ].join("\n");
}

/**
 * Link do WhatsApp (api.whatsapp.com/send, como no restante do projeto).
 * Sem número → null: a UI mostra "sem WhatsApp" e oferece só copiar a mensagem.
 */
export function whatsappUrl(phone: string | null | undefined, text: string): string | null {
  if (!phone) return null;
  // Sempre com o código do país 55 (normalizado antes de montar o link).
  const normalized = normalizeCustomerWhatsapp(phone);
  if (!normalized.ok) return null;
  return `https://api.whatsapp.com/send?phone=${normalized.value}&text=${encodeURIComponent(text)}`;
}

export interface PostSaleInput {
  deliveryStatus: DeliveryStatus;
  carrier: string | null;
  trackingCode: string | null;
}

export interface Availability {
  enabled: boolean;
  reason: string | null;
}

/** Quando cada ação pode ser usada. Review só com DELIVERED (regra da loja). */
export function postSaleAvailability(input: PostSaleInput): Record<PostSaleKind, Availability> {
  const shipped = input.deliveryStatus === "IN_TRANSIT" || input.deliveryStatus === "DELIVERED" || input.deliveryStatus === "RESENT";
  const tracking: Availability = !trackingCarrier(input.carrier)
    ? { enabled: false, reason: "Transportadora sem mensagem de rastreio definida (J&T ou Correios)." }
    : !input.trackingCode?.trim()
      ? { enabled: false, reason: "Sem código de rastreio." }
      : !shipped
        ? { enabled: false, reason: "Disponível depois que o pedido for enviado." }
        : { enabled: true, reason: null };

  const delivery: Availability =
    input.deliveryStatus === "IN_TRANSIT" || input.deliveryStatus === "DELIVERED"
      ? { enabled: true, reason: null }
      : { enabled: false, reason: "Disponível para pedidos em trânsito ou entregues." };

  const review: Availability =
    input.deliveryStatus === "DELIVERED"
      ? { enabled: true, reason: null }
      : { enabled: false, reason: "Liberada depois da entrega (status Entregue)." };

  return { tracking, delivery, review };
}

/** Evento "abri o WhatsApp" lido da trilha (fulfillment_audit_logs). Sem texto, sem PII. */
export interface OpenedEvent {
  created_at: string;
  actor_name: string | null;
}

/** Linha de fulfillment_followups (o estado durável de UM follow-up de UM registro). */
export interface FollowupRow {
  type: FollowupType;
  status: "OPEN" | "SENT";
  sent_at: string | null;
  sent_by_name: string | null;
  message_snapshot: string | null;
}

export interface PostSaleState {
  status: "OPEN" | "SENT";
  /** Preenchido só quando SENT. */
  sentAt: string | null;
  sentByName: string | null;
  /** Texto EXATO confirmado como enviado. Nulo em follow-ups antigos, confirmados antes
   * de o sistema guardar o texto — nesse caso a UI mostra um aviso, nunca inventa o texto. */
  messageSnapshot: string | null;
  /** Sub-detalhe "WhatsApp aberto" — só tem sentido enquanto OPEN. */
  openedAt: string | null;
  openedByName: string | null;
  /**
   * Alguma vez essa ação foi aberta pelo ABRIR WHATSAPP deste painel. Só informativo
   * (mostra "WhatsApp aberto em...") — NÃO é condição para confirmar. A funcionária
   * pode ter enviado por outro caminho (WhatsApp Desktop, celular, copiar e colar);
   * CONFIRMAR QUE ENVIEI é a única fonte da verdade sobre o envio.
   */
  hasOpenedBefore: boolean;
}

const time = (iso: string) => new Date(iso).getTime();

/**
 * Estado de UM follow-up: a linha de fulfillment_followups decide SENT ou OPEN —
 * nunca os cliques de copiar/abrir. A trilha de auditoria só alimenta o sub-detalhe
 * "WhatsApp aberto" e a exigência de abrir antes de confirmar.
 */
export function derivePostSaleState(followup: FollowupRow, openedEvents: readonly OpenedEvent[]): PostSaleState {
  if (followup.status === "SENT") {
    return {
      status: "SENT",
      sentAt: followup.sent_at,
      sentByName: followup.sent_by_name,
      messageSnapshot: followup.message_snapshot,
      openedAt: null,
      openedByName: null,
      hasOpenedBefore: true,
    };
  }

  const latestOpened = openedEvents.reduce<OpenedEvent | null>(
    (best, e) => (!best || time(e.created_at) > time(best.created_at) ? e : best),
    null
  );
  return {
    status: "OPEN",
    sentAt: null,
    sentByName: null,
    messageSnapshot: null,
    openedAt: latestOpened?.created_at ?? null,
    openedByName: latestOpened?.actor_name ?? null,
    hasOpenedBefore: openedEvents.length > 0,
  };
}

export type PostSalePlan = { ok: true; action: PostSaleAction } | { ok: false; error: string };

/**
 * Decide o que o clique pode registrar.
 *  - ABRIR (opened): liberado sempre que a ação estiver disponível — mesmo depois de SENT
 *    (é o "REENVIAR PELO WHATSAPP": reabre a conversa, não volta o status a OPEN).
 *    Nunca muda o status do follow-up.
 *  - CONFIRMAR (confirmed): liberado sempre que a ação estiver disponível e ainda OPEN —
 *    NÃO exige ter aberto o WhatsApp por este painel antes. A funcionária pode ter enviado
 *    por outro caminho (WhatsApp Desktop, celular, copiar e colar); CONFIRMAR QUE ENVIEI
 *    é a única fonte da verdade, e é sempre uma ação humana explícita, nunca automática.
 */
export function planPostSaleEvent(input: {
  kind: PostSaleKind;
  phase: PostSalePhase;
  availability: Availability;
  state: PostSaleState;
}): PostSalePlan {
  if (!input.availability.enabled) return { ok: false, error: input.availability.reason ?? "Ação indisponível." };
  if (input.phase === "confirmed" && input.state.status === "SENT") {
    return { ok: false, error: "Este follow-up já foi confirmado como enviado." };
  }
  return { ok: true, action: POST_SALE_ACTIONS[input.kind][input.phase] };
}
