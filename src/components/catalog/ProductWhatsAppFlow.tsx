"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SellerSelectionDrawer } from "@/components/catalog/SellerSelectionDrawer";
import { SingleSizeSelector } from "@/components/catalog/SingleSizeSelector";
import { getVisitorSessionId } from "@/lib/session/visitor-id";
import { captureAndPersistUtm } from "@/lib/utm/persist";
import { submitWhatsAppClick } from "@/lib/whatsapp/click-action";
import type { ProductStatus } from "@/types/database";

export function ProductWhatsAppFlow({
  productId,
  status,
  sizes,
  sellers,
}: {
  productId: string;
  status: ProductStatus;
  sizes: string[];
  sellers: { id: string; name: string }[];
}) {
  const isSoldOut = status === "SOLD_OUT";
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null); // sellerId sendo processado, ou "any"
  const [error, setError] = useState<string | null>(null);

  // Peça esgotada não pede tamanho — a pergunta vira "tem algo parecido?".
  const needsSize = !isSoldOut && sizes.length > 0 && !selectedSize;

  async function handleSellerChoice(sellerId: string | null) {
    setError(null);
    setSubmitting(sellerId ?? "any");

    try {
      const utm = captureAndPersistUtm();
      const result = await submitWhatsAppClick({
        productId,
        size: selectedSize,
        sellerId,
        sessionId: getVisitorSessionId(),
        utmSource: utm.utm_source ?? null,
        utmMedium: utm.utm_medium ?? null,
        utmCampaign: utm.utm_campaign ?? null,
        utmContent: utm.utm_content ?? null,
        referrer: utm.referrer ?? null,
      });

      if ("error" in result) {
        setError(result.error);
        setSubmitting(null);
        return;
      }

      window.location.href = result.url;
    } catch {
      setError("Não foi possível abrir o WhatsApp. Tente novamente.");
      setSubmitting(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {!isSoldOut && <SingleSizeSelector sizes={sizes} value={selectedSize} onChange={setSelectedSize} />}

      <Button type="button" disabled={needsSize} onClick={() => setDrawerOpen(true)} className="h-12">
        {isSoldOut ? "Quero algo parecido" : "Quero essa peça"}
      </Button>
      {needsSize && <p className="text-xs text-text-muted">Escolha o tamanho que você procura.</p>}

      <SellerSelectionDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sellers={sellers}
        onChoose={handleSellerChoice}
        submitting={submitting}
        error={error}
      />
    </div>
  );
}
