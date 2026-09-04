"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { FavoriteProductRow } from "@/components/catalog/FavoriteProductRow";
import { SellerSelectionDrawer } from "@/components/catalog/SellerSelectionDrawer";
import { getFavoriteProductsAction } from "@/lib/favorites/actions";
import { recordFavoriteEvent } from "@/lib/favorites/analytics";
import { markJustContactedSeller } from "@/lib/favorites/post-contact";
import { clearFavorites, removeFavoritesNotIn } from "@/lib/favorites/storage";
import { useFavoritesList } from "@/lib/favorites/useFavorites";
import { getVisitorSessionId } from "@/lib/session/visitor-id";
import { captureAndPersistUtm } from "@/lib/utm/persist";
import { submitFavoritesWhatsAppClick } from "@/lib/whatsapp/favorites-click-action";
import { trackLead } from "@/lib/analytics/meta-pixel";
import type { ProductDetail } from "@/lib/db/products";
import type { PaymentSettings } from "@/lib/site-settings/payments";

/**
 * Limite de itens enviados numa única mensagem — decisão explícita (não
 * silenciosa, ver aviso na UI abaixo): favoritar não tem limite nenhum,
 * mas uma mensagem de WhatsApp com dezenas de peças vira ilegível. 20 é
 * generoso para o uso real da loja; quem tiver mais vê um aviso claro de
 * que só as mais recentes entram na mensagem.
 */
const MAX_ITEMS_TO_SEND = 20;

export function FavoritesPageClient({
  sellers,
  paymentSettings,
}: {
  sellers: { id: string; name: string }[];
  paymentSettings: PaymentSettings;
}) {
  const entries = useFavoritesList();
  const [fetched, setFetched] = useState<{ key: string; data: ProductDetail[] } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [sellerError, setSellerError] = useState<string | null>(null);
  const [selectionFailed, setSelectionFailed] = useState(false);
  const [lastSellerId, setLastSellerId] = useState<string | null>(null);
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const viewedRef = useRef(false);
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const ids = entries.map((e) => e.product_id);
  const idsKey = ids.slice().sort().join(",");
  const isEmpty = ids.length === 0;

  useEffect(() => {
    if (isEmpty) return; // nada pra buscar — "products" já deriva [] direto no render

    let cancelled = false;

    getFavoriteProductsAction(ids).then((result) => {
      if (cancelled) return;

      // A ordem de retorno do banco não segue a ordem dos ids pedidos —
      // reordena pela ordem local (mais recente primeiro).
      const byId = new Map(result.map((p) => [p.id, p]));
      const ordered = ids.map((id) => byId.get(id)).filter((p): p is ProductDetail => Boolean(p));
      setFetched({ key: idsKey, data: ordered });

      // Qualquer id pedido que não voltou é arquivado/despublicado/excluído
      // — limpeza automática seguindo a regra do módulo.
      if (byId.size !== ids.length) {
        removeFavoritesNotIn(new Set(byId.keys()));
      }
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, isEmpty]);

  // null = carregando (ainda não temos um fetch resolvido pra esse exato
  // conjunto de ids — evita mostrar dado de uma lista antiga por um instante).
  const products = isEmpty ? [] : fetched?.key === idsKey ? fetched.data : null;

  useEffect(() => {
    if (viewedRef.current) return;
    viewedRef.current = true;
    const utm = captureAndPersistUtm();
    recordFavoriteEvent({
      eventType: "FAVORITES_VIEW",
      sessionId: getVisitorSessionId(),
      utmSource: utm.utm_source ?? null,
      utmMedium: utm.utm_medium ?? null,
      utmCampaign: utm.utm_campaign ?? null,
      utmContent: utm.utm_content ?? null,
      referrer: utm.referrer ?? null,
    }).catch(() => {});
  }, []);

  function handleClearAll() {
    if (!window.confirm("Tem certeza que quer limpar todos os favoritos?")) return;
    clearFavorites();
  }

  function handleSendClick() {
    setValidationError(null);
    setPendingProductId(null);
    if (!products) return;

    const entryByProductId = new Map(entries.map((e) => [e.product_id, e]));
    const available = products.filter((p) => p.status !== "SOLD_OUT");

    const firstMissing = available.find(
      (p) => p.sizes.length > 0 && !entryByProductId.get(p.id)?.selected_size
    );

    if (firstMissing) {
      setPendingProductId(firstMissing.id);
      setValidationError("Escolha o tamanho das peças antes de enviar sua seleção.");
      rowRefs.current.get(firstMissing.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    setSellerError(null);
    setSelectionFailed(false);
    setDrawerOpen(true);
  }

  async function handleSellerChoice(sellerId: string | null, skipSelectionLink = false) {
    if (!products) return;
    setSellerError(null);
    setSelectionFailed(false);
    setLastSellerId(sellerId);
    setSubmitting(sellerId ?? "any");

    const entryByProductId = new Map(entries.map((e) => [e.product_id, e]));
    const available = products.filter((p) => p.status !== "SOLD_OUT").slice(0, MAX_ITEMS_TO_SEND);
    const items = available.map((p) => ({
      productId: p.id,
      size: entryByProductId.get(p.id)?.selected_size ?? null,
    }));

    try {
      const utm = captureAndPersistUtm();
      const result = await submitFavoritesWhatsAppClick({
        items,
        sellerId,
        sessionId: getVisitorSessionId(),
        utmSource: utm.utm_source ?? null,
        utmMedium: utm.utm_medium ?? null,
        utmCampaign: utm.utm_campaign ?? null,
        utmContent: utm.utm_content ?? null,
        referrer: utm.referrer ?? null,
        skipSelectionLink,
      });

      if ("error" in result) {
        setSellerError(result.error);
        setSelectionFailed(result.code === "selection_failed");
        setSubmitting(null);
        return;
      }

      markJustContactedSeller();
      trackLead(result.leadData);
      window.location.href = result.url;
    } catch {
      setSellerError("Não foi possível abrir o WhatsApp. Tente novamente.");
      setSelectionFailed(false);
      setSubmitting(null);
    }
  }

  if (products === null) {
    return <p className="py-12 text-center text-sm text-text-muted">Carregando seus favoritos...</p>;
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-4 py-16 text-center">
        <p className="font-display text-lg text-text">Seu provador começa aqui ❤️</p>
        <p className="max-w-xs text-sm text-text-muted">
          Salve as peças que você gostou e, quando quiser, envie toda a sua seleção para uma vendedora.
        </p>
        <Link href="/novidades">
          <Button className="mt-2">Ver novidades</Button>
        </Link>
      </div>
    );
  }

  const entryByProductId = new Map(entries.map((e) => [e.product_id, e]));

  return (
    <div className="flex flex-col gap-4">
      {products.length > MAX_ITEMS_TO_SEND && (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs text-text-muted">
          Você tem {products.length} peças salvas — para manter a mensagem organizada, sua seleção enviará
          as {MAX_ITEMS_TO_SEND} mais recentes.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {products.map((product) => (
          <FavoriteProductRow
            key={product.id}
            product={product}
            selectedSize={entryByProductId.get(product.id)?.selected_size ?? null}
            pending={pendingProductId === product.id}
            rowRef={(el) => {
              if (el) rowRefs.current.set(product.id, el);
              else rowRefs.current.delete(product.id);
            }}
            paymentSettings={paymentSettings}
          />
        ))}
      </div>

      {validationError && <p className="text-sm text-red-600">{validationError}</p>}

      <Button type="button" onClick={handleSendClick} className="h-12">
        Enviar minha seleção
      </Button>

      <button
        type="button"
        onClick={handleClearAll}
        className="self-center text-xs text-text-muted hover:text-red-600"
      >
        Limpar favoritos
      </button>

      <SellerSelectionDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sellers={sellers}
        onChoose={(sellerId) => handleSellerChoice(sellerId)}
        submitting={submitting}
        error={sellerError}
        errorActions={
          selectionFailed
            ? [
                { label: "Tentar novamente", onClick: () => handleSellerChoice(lastSellerId) },
                {
                  label: "Enviar somente a lista",
                  onClick: () => handleSellerChoice(lastSellerId, true),
                },
              ]
            : undefined
        }
      />
    </div>
  );
}
