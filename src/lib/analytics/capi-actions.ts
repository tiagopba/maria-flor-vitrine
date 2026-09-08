"use server";

import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { sendCapiEvent } from "@/lib/analytics/meta-capi";

/**
 * Server Actions estreitas (whitelist por assinatura, não um endpoint
 * genérico de `event_name` livre) que espelham exatamente o padrão já
 * validado do Lead (favorites-click-action.ts/click-action.ts): mesmo
 * `sendCapiEvent`, mesma leitura de token, roda via `after()` (nunca
 * atrasa nem pode quebrar a resposta ao client), fail-open (qualquer
 * falha fica isolada dentro de sendCapiEvent).
 */
export interface ProductCapiInput {
  /** Mesmo valor enviado como `eventID` no `fbq()` do browser — é isso que permite a Meta deduplicar. */
  eventId: string;
  /** `window.location.href` da cliente no momento da ação. */
  eventSourceUrl: string;
  productCode: string;
  productName: string;
  price: number;
}

export interface AddToCartCapiInput extends ProductCapiInput {
  selectedSize?: string | null;
}

/** ViewContent — servidor, mesmo event_id do Pixel do browser (ver ProductViewTracker). */
export async function sendViewContentCapi(input: ProductCapiInput): Promise<void> {
  after(async () => {
    try {
      const [hdrs, cookieStore] = await Promise.all([headers(), cookies()]);
      await sendCapiEvent({
        eventName: "ViewContent",
        eventId: input.eventId,
        eventSourceUrl: input.eventSourceUrl,
        userData: {
          clientIpAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim(),
          clientUserAgent: hdrs.get("user-agent") ?? undefined,
          fbp: cookieStore.get("_fbp")?.value,
          fbc: cookieStore.get("_fbc")?.value,
        },
        customData: {
          content_ids: [input.productCode],
          content_name: input.productName,
          content_type: "product",
          value: input.price,
          currency: "BRL",
        },
      });
    } catch {
      // sendCapiEvent já trata os próprios erros internamente; nunca deve
      // chegar aqui, mas por segurança nunca deixa nada escapar do after().
    }
  });
}

/** AddToCart — servidor, mesmo event_id do Pixel do browser (ver ProductWhatsAppFlow.addToSelection). */
export async function sendAddToCartCapi(input: AddToCartCapiInput): Promise<void> {
  after(async () => {
    try {
      const [hdrs, cookieStore] = await Promise.all([headers(), cookies()]);
      await sendCapiEvent({
        eventName: "AddToCart",
        eventId: input.eventId,
        eventSourceUrl: input.eventSourceUrl,
        userData: {
          clientIpAddress: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim(),
          clientUserAgent: hdrs.get("user-agent") ?? undefined,
          fbp: cookieStore.get("_fbp")?.value,
          fbc: cookieStore.get("_fbc")?.value,
        },
        customData: {
          content_ids: [input.productCode],
          content_name: input.productName,
          content_type: "product",
          value: input.price,
          currency: "BRL",
          ...(input.selectedSize ? { selected_size: input.selectedSize } : {}),
        },
      });
    } catch {
      // Idem sendViewContentCapi acima.
    }
  });
}
