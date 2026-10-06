// Mensagem para enviar o link de coleta — PURO. Não é enviada automaticamente.
import { greetingHello } from "../fulfillment/greeting.ts";
import { whatsappUrl } from "../fulfillment/post-sale.ts";

export function buildIntakeLinkMessage(customerName: string, link: string): string {
  return [
    `${greetingHello(customerName)}! 💕`,
    "Para emitirmos sua nota fiscal e prepararmos o envio do seu pedido, precisamos que você preencha seus dados neste link seguro:",
    link,
    "É rapidinho. 🌷",
    "Maria Flor",
  ].join("\n");
}

/** Link do WhatsApp com a mensagem pronta (o funcionário ainda aperta enviar). */
export function intakeWhatsappUrl(customerWhatsapp: string | null, customerName: string, link: string): string | null {
  return whatsappUrl(customerWhatsapp, buildIntakeLinkMessage(customerName, link));
}
