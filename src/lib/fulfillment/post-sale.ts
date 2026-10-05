// Pós-venda por WhatsApp — PURO. Monta mensagens, links e estados.
// NENHUMA mensagem é enviada aqui: o sistema só prepara o texto, abre o WhatsApp
// e registra o clique. "Enviado" só existe quando o funcionário confirma.
import type { DeliveryStatus } from "./delivery.ts";
import { normalizeCustomerWhatsapp } from "./phone.ts";
import { normalizeForCompare } from "./text.ts";

export const POST_SALE_KINDS = ["tracking", "delivery", "review"] as const;
export type PostSaleKind = (typeof POST_SALE_KINDS)[number];
export type PostSalePhase = "opened" | "confirmed";

/** Ações da trilha de auditoria (nomes fixos; sem texto de mensagem, telefone ou CPF). */
export const POST_SALE_ACTIONS = {
  tracking: { opened: "TRACKING_WHATSAPP_OPENED", confirmed: "TRACKING_MESSAGE_CONFIRMED" },
  delivery: { opened: "DELIVERY_CONFIRMATION_WHATSAPP_OPENED", confirmed: "DELIVERY_CONFIRMATION_CONFIRMED" },
  review: { opened: "GOOGLE_REVIEW_WHATSAPP_OPENED", confirmed: "GOOGLE_REVIEW_CONFIRMED" },
} as const;

export type PostSaleAction = (typeof POST_SALE_ACTIONS)[PostSaleKind][PostSalePhase];

export const POST_SALE_AUDIT_ACTIONS: readonly PostSaleAction[] = Object.values(POST_SALE_ACTIONS).flatMap((a) => [a.opened, a.confirmed]);

export const POST_SALE_LABELS: Record<PostSaleKind, string> = {
  tracking: "Rastreio",
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

const CONNECTIVES = new Set(["da", "de", "do", "das", "dos", "e"]);

/** "NEUSA CARDIM" → "Neusa Cardim" (só para a saudação; o nome gravado não muda). */
export function greetingName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
    .split(" ")
    .map((word, i) => (i > 0 && CONNECTIVES.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}

export interface TrackingMessageInput {
  customerName: string;
  carrier: string | null;
  service: string | null;
  trackingCode: string | null;
}

/** Mensagem de rastreio. Devolve null quando não há código ou a transportadora não tem mensagem definida. */
export function buildTrackingMessage(input: TrackingMessageInput): string | null {
  const carrier = trackingCarrier(input.carrier);
  const code = input.trackingCode?.trim();
  if (!carrier || !code) return null;
  const name = greetingName(input.customerName);

  if (carrier === "jt") {
    return [
      `Olá, ${name}`,
      "Seu pedido já foi enviado pela transportadora J&T Express 📦✨",
      "Aqui está o seu código de rastreio:",
      code,
      "📦 Você pode acompanhar a entrega pelo site:",
      JT_TRACKING_URL,
      "Obrigada por comprar com a Maria Flor 🌷",
      "Esperamos que você ame suas peças! 💛",
    ].join("\n");
  }

  const service = input.service?.trim();
  return [
    `Olá, ${name}`,
    `Seu pedido já foi enviado pelos Correios${service ? ` (${service})` : ""} 📦✨`,
    "Aqui está o seu código de rastreio:",
    code,
    "📦 Você pode acompanhar a entrega pelo site dos Correios:",
    CORREIOS_TRACKING_URL,
    "Obrigada por comprar com a Maria Flor 🌷",
    "Esperamos que você ame suas peças! 💛",
  ].join("\n");
}

export function buildDeliveryConfirmationMessage(customerName: string): string {
  return [
    `Olá, ${greetingName(customerName)}! 💕`,
    "Passando para confirmar se o seu pedido da Maria Flor chegou tudo certinho. 📦✨",
    "Deu tudo certo com a entrega e com as peças? 🥰",
    "Se precisar de qualquer ajuda, estamos por aqui!",
    "Muito obrigada por comprar com a Maria Flor 🌷",
  ].join("\n");
}

export function buildGoogleReviewMessage(customerName: string): string {
  return [
    `Olá, ${greetingName(customerName)}! 💕`,
    "Espero que tenha gostado do meu atendimento e que seu pedido tenha chegado tudo certinho. 🥰",
    "Sua opinião é muito importante para nós!",
    "Se puder, deixe uma avaliação da sua experiência com a Maria Flor no Google. ⭐⭐⭐⭐⭐",
    "É rapidinho e ajuda muito nossa loja a continuar crescendo! 💕",
    "Muito obrigada pela confiança e preferência! 🛍️✨",
    GOOGLE_REVIEW_URL,
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

export interface PostSaleEvent {
  action: string;
  created_at: string;
  actor_name: string | null;
}

export interface PostSaleState {
  state: "none" | "opened" | "confirmed";
  opened: PostSaleEvent | null;
  confirmed: PostSaleEvent | null;
}

const time = (iso: string) => new Date(iso).getTime();

/**
 * Estado de uma ação a partir da trilha. OPENED nunca vira CONFIRMED sozinho:
 * só CONFIRMED (mais recente ou igual ao último OPENED) vale como "enviado".
 */
export function derivePostSaleState(events: readonly PostSaleEvent[], kind: PostSaleKind): PostSaleState {
  const actions = POST_SALE_ACTIONS[kind];
  const latest = (action: string) =>
    events
      .filter((e) => e.action === action)
      .reduce<PostSaleEvent | null>((best, e) => (!best || time(e.created_at) > time(best.created_at) ? e : best), null);

  const opened = latest(actions.opened);
  const confirmed = latest(actions.confirmed);
  if (confirmed && (!opened || time(confirmed.created_at) >= time(opened.created_at))) {
    return { state: "confirmed", opened, confirmed };
  }
  if (opened) return { state: "opened", opened, confirmed };
  return { state: "none", opened: null, confirmed: null };
}

export type PostSalePlan = { ok: true; action: PostSaleAction } | { ok: false; error: string };

/**
 * Decide o que o clique pode registrar.
 *  - ABRIR (opened): só se a ação estiver liberada.
 *  - CONFIRMAR (confirmed): só depois de um ABRIR — confirmação manual, nunca automática.
 */
export function planPostSaleEvent(input: {
  kind: PostSaleKind;
  phase: PostSalePhase;
  availability: Availability;
  state: PostSaleState["state"];
}): PostSalePlan {
  if (!input.availability.enabled) return { ok: false, error: input.availability.reason ?? "Ação indisponível." };
  if (input.phase === "confirmed" && input.state !== "opened") {
    return { ok: false, error: "Abra o WhatsApp antes de confirmar o envio." };
  }
  return { ok: true, action: POST_SALE_ACTIONS[input.kind][input.phase] };
}
