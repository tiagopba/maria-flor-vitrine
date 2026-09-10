"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { FavoriteProductRow } from "@/components/catalog/FavoriteProductRow";
import { FreeShippingAccordion } from "@/components/catalog/FreeShippingAccordion";
import { SellerSelectionDrawer } from "@/components/catalog/SellerSelectionDrawer";
import { recordFavoriteEvent } from "@/lib/favorites/analytics";
import { markJustContactedSeller } from "@/lib/favorites/post-contact";
import {
  clearFavorites,
  FAVORITES_CHANGED_EVENT,
  getFavorites,
  removeFavoritesNotIn,
  type FavoriteEntry,
} from "@/lib/favorites/storage";
import { getSavedShippingState } from "@/lib/shipping/state-storage";
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

/**
 * Glifo oficial do WhatsApp (simple-icons), em verde da marca — inline
 * porque o projeto não tem lib de ícones de marca (lucide só tem
 * MessageCircle genérico) e a instrução explícita foi não adicionar
 * dependência nova nem usar imagem rasterizada.
 */
function WhatsAppIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" fill="#25D366" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.868-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413" />
    </svg>
  );
}

/**
 * Placeholder de uma linha enquanto os dados reais não chegam — sem
 * imagem nenhuma (nada aqui espera bytes de foto pra sumir), só blocos
 * `animate-pulse` no formato de FavoriteProductRow. A quantidade de linhas
 * já é conhecida pelo localStorage (ver `entries.length` abaixo), então o
 * loading mostra a forma real da lista em vez de um texto genérico.
 */
function FavoriteProductRowSkeleton() {
  return (
    <div className="flex animate-pulse gap-3 rounded-2xl border border-border bg-surface p-3">
      <div className="h-28 w-24 shrink-0 rounded-xl bg-muted sm:h-32 sm:w-28" />
      <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
        <div className="h-3.5 w-3/4 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted" />
        <div className="mt-1 h-4 w-2/5 rounded bg-muted" />
        <div className="mt-1 h-7 w-1/2 rounded-full bg-muted" />
      </div>
    </div>
  );
}

export function FavoritesPageClient({
  sellers,
  paymentSettings,
}: {
  sellers: { id: string; name: string }[];
  paymentSettings: PaymentSettings;
}) {
  const [entries, setEntries] = useState<FavoriteEntry[]>([]);
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
  // Último conjunto de ids já buscado — evita refetch quando só o tamanho
  // escolhido de uma peça muda (o mesmo evento de storage.ts dispara pros
  // dois casos; só um conjunto de ids diferente precisa de um novo fetch).
  const lastFetchedKeyRef = useRef<string | null>(null);

  const ids = entries.map((e) => e.product_id);
  const idsKey = ids.slice().sort().join(",");
  const isEmpty = ids.length === 0;

  // Um único efeito: lê o localStorage e, no mesmo tick, já dispara o
  // fetch — sem esperar um segundo efeito reagir à mudança de estado do
  // primeiro (ver auditoria de performance de /favoritos). `fetch()`
  // comum (não Server Action) roda em paralelo de verdade com
  // FAVORITES_VIEW/PAGE_VIEW/etc, que continuam disparando exatamente como
  // antes, sem segurar a UI.
  useEffect(() => {
    let cancelled = false;

    function sync() {
      const currentEntries = getFavorites();
      setEntries(currentEntries);

      const currentIds = currentEntries.map((e) => e.product_id);
      const key = currentIds.slice().sort().join(",");

      if (key === lastFetchedKeyRef.current) return; // já buscado (ou já em andamento) pra este conjunto

      if (currentIds.length === 0) {
        lastFetchedKeyRef.current = key;
        setFetched({ key, data: [] });
        return;
      }

      // `lastFetchedKeyRef` só é marcado como concluído dentro do `.then`
      // (nunca antes de disparar o fetch): em StrictMode (dev) o efeito
      // roda duas vezes, e marcar a ref cedo demais faria a 2ª chamada
      // (a que realmente sobrevive) achar que já tinha sido buscada e
      // nunca atualizar `fetched` — prende a tela em loading pra sempre.
      fetch(`/api/favoritos/produtos?ids=${currentIds.join(",")}`, { cache: "no-store" })
        .then((res) => res.json())
        .then((result: ProductDetail[]) => {
          if (cancelled) return;
          lastFetchedKeyRef.current = key;

          // A ordem de retorno do banco não segue a ordem dos ids pedidos —
          // reordena pela ordem local (mais recente primeiro).
          const byId = new Map(result.map((p) => [p.id, p]));
          const ordered = currentIds.map((id) => byId.get(id)).filter((p): p is ProductDetail => Boolean(p));
          setFetched({ key, data: ordered });

          // Qualquer id pedido que não voltou é arquivado/despublicado/excluído
          // — limpeza automática seguindo a regra do módulo.
          if (byId.size !== currentIds.length) {
            removeFavoritesNotIn(new Set(byId.keys()));
          }
        });
    }

    sync();
    window.addEventListener(FAVORITES_CHANGED_EVENT, sync);
    return () => {
      cancelled = true;
      window.removeEventListener(FAVORITES_CHANGED_EVENT, sync);
    };
  }, []);

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
    if (!window.confirm("Tem certeza que quer limpar todas as peças escolhidas?")) return;
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
      setValidationError("Escolha o tamanho desta peça antes de tirar dúvidas no WhatsApp.");
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

    // Um único id pros dois lados do Lead (Pixel do browser + Conversions
    // API) — é isso que permite a Meta reconhecer as duas chamadas como um
    // único evento em vez de contar duas conversões.
    const eventId = crypto.randomUUID();

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
        eventId,
        eventSourceUrl: window.location.href,
        // Totalmente opcional — lido do localStorage só agora, na hora de
        // montar a mensagem; sem UF salva isso é null e a mensagem sai
        // idêntica à de sempre (ver buildFavoritesWhatsAppMessage).
        shippingStateCode: getSavedShippingState(),
      });

      if ("error" in result) {
        setSellerError(result.error);
        setSelectionFailed(result.code === "selection_failed");
        setSubmitting(null);
        return;
      }

      markJustContactedSeller();
      trackLead(result.leadData, eventId);
      window.location.href = result.url;
    } catch {
      setSellerError("Não foi possível abrir o WhatsApp. Tente novamente.");
      setSelectionFailed(false);
      setSubmitting(null);
    }
  }

  if (products === null) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: entries.length || 1 }).map((_, index) => (
          <FavoriteProductRowSkeleton key={index} />
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-4 py-16 text-center">
        <p className="font-display text-lg text-text">Você ainda não escolheu nenhuma peça ❤️</p>
        <p className="max-w-xs text-sm text-text-muted">
          Explore a vitrine e toque em &quot;Quero essa peça&quot; nas peças que gostar.
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
          Você tem {products.length} peças salvas — para facilitar o atendimento, vamos enviar para a
          vendedora as {MAX_ITEMS_TO_SEND} mais recentes.
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

      <FreeShippingAccordion />

      {validationError && <p className="text-sm text-red-600">{validationError}</p>}

      <Button type="button" onClick={handleSendClick} className="h-12 w-full gap-2 uppercase tracking-wide">
        <WhatsAppIcon />
        Tirar dúvidas no WhatsApp
      </Button>

      <Link href="/novidades">
        <Button type="button" variant="secondary" className="h-12 w-full uppercase tracking-wide">
          Ver mais peças
        </Button>
      </Link>

      <button
        type="button"
        onClick={handleClearAll}
        className="self-center text-xs text-text-muted hover:text-red-600"
      >
        LIMPAR SELEÇÃO ROUPAS
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
