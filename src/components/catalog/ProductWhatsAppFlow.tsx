"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Drawer } from "@/components/ui/Drawer";
import { getVisitorSessionId } from "@/lib/session/visitor-id";
import { captureAndPersistUtm } from "@/lib/utm/persist";
import { submitWhatsAppClick } from "@/lib/whatsapp/click-action";
import { cn } from "@/lib/utils";

export function ProductWhatsAppFlow({
  productId,
  sizes,
  sellers,
}: {
  productId: string;
  sizes: string[];
  sellers: { id: string; name: string }[];
}) {
  const singleSize = sizes.length === 1 ? sizes[0] : null;
  const [selectedSize, setSelectedSize] = useState<string | null>(singleSize);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null); // sellerId sendo processado, ou "any"
  const [error, setError] = useState<string | null>(null);

  const needsSize = sizes.length > 0 && !selectedSize;

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
      {sizes.length > 1 && (
        <div>
          <p className="mb-1.5 text-sm font-medium text-text">Selecione o tamanho</p>
          <div className="flex flex-wrap gap-1.5">
            {sizes.map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => setSelectedSize(size)}
                className={cn(
                  "flex h-10 min-w-10 items-center justify-center rounded-full border px-3 text-sm font-medium transition-colors",
                  selectedSize === size
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-surface text-text hover:bg-muted"
                )}
              >
                {size}
              </button>
            ))}
          </div>
        </div>
      )}

      {singleSize && (
        <p className="text-sm text-text">
          Tamanho: <span className="font-medium">{singleSize}</span>
        </p>
      )}

      <Button
        type="button"
        disabled={needsSize}
        onClick={() => setDrawerOpen(true)}
        className="h-12"
      >
        Quero essa peça
      </Button>
      {needsSize && <p className="text-xs text-text-muted">Selecione um tamanho para continuar.</p>}

      <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Falar com uma vendedora">
        <div className="flex flex-col gap-2">
          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="button"
            disabled={submitting !== null}
            onClick={() => handleSellerChoice(null)}
            className="flex h-12 items-center justify-center rounded-xl bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {submitting === "any" ? "Abrindo..." : "Qualquer vendedora"}
          </button>

          {sellers.map((seller) => (
            <button
              key={seller.id}
              type="button"
              disabled={submitting !== null}
              onClick={() => handleSellerChoice(seller.id)}
              className="flex h-12 items-center justify-center rounded-xl border border-border text-sm font-medium text-text hover:bg-muted disabled:opacity-60"
            >
              {submitting === seller.id ? "Abrindo..." : seller.name}
            </button>
          ))}

          {sellers.length === 0 && (
            <p className="py-2 text-center text-sm text-text-muted">
              Nenhuma vendedora cadastrada no momento.
            </p>
          )}
        </div>
      </Drawer>
    </div>
  );
}
