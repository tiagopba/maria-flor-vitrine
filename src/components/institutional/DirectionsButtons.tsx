"use client";

import { Map, MessageCircle, Navigation } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { recordInstitutionalEvent } from "@/lib/institutional/analytics";
import { getVisitorSessionId } from "@/lib/session/visitor-id";
import { captureAndPersistUtm } from "@/lib/utm/persist";

/**
 * Botões de "Como Chegar" — cada um só aparece se o link correspondente
 * estiver configurado em site_settings (nunca um botão quebrado). Sem
 * iframe de mapa incorporado de propósito: a prioridade é abrir o app
 * (Google Maps/Waze/WhatsApp) já instalado no celular da cliente, que é
 * mais leve e mais útil do que um mapa embutido na página.
 */
export function DirectionsButtons({
  googleMapsUrl,
  wazeUrl,
  whatsappUrl,
}: {
  googleMapsUrl: string | null;
  wazeUrl: string | null;
  whatsappUrl: string | null;
}) {
  function track(provider: "google_maps" | "waze") {
    const utm = captureAndPersistUtm();
    recordInstitutionalEvent({
      eventType: "STORE_DIRECTIONS_CLICK",
      sessionId: getVisitorSessionId(),
      utmSource: utm.utm_source ?? null,
      utmMedium: utm.utm_medium ?? null,
      utmCampaign: utm.utm_campaign ?? null,
      utmContent: utm.utm_content ?? null,
      referrer: utm.referrer ?? null,
      metadata: { provider },
    }).catch(() => {});
  }

  if (!googleMapsUrl && !wazeUrl && !whatsappUrl) {
    return (
      <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-text-muted">
        Em breve nossos links de localização estarão disponíveis aqui.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {googleMapsUrl && (
        <a href={googleMapsUrl} target="_blank" rel="noopener noreferrer" onClick={() => track("google_maps")}>
          <Button className="h-12 w-full gap-2">
            <Map className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Abrir no Google Maps
          </Button>
        </a>
      )}
      {wazeUrl && (
        <a href={wazeUrl} target="_blank" rel="noopener noreferrer" onClick={() => track("waze")}>
          <Button variant="secondary" className="h-12 w-full gap-2">
            <Navigation className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Abrir no Waze
          </Button>
        </a>
      )}
      {whatsappUrl && (
        <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary" className="h-12 w-full gap-2">
            <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Falar com a loja
          </Button>
        </a>
      )}
    </div>
  );
}
