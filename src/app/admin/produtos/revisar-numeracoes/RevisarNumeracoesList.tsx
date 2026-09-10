"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { SizeFitReviewProduct } from "@/lib/db/product-size-fit";
import { saveProductSizeFitCompatibilityAction } from "../size-fit-actions";
import { SizeFitCompatibilityFields } from "../SizeFitCompatibilityFields";

type Tab = "pending" | "reviewed";

/**
 * Lista client-side de revisão — Pendentes/Revisados é alternância local
 * (não recarrega a página; busca/categoria continuam via GET no servidor,
 * como o resto do Admin). Cada card edita sua própria compatibilidade e
 * salva isoladamente pela RPC dedicada — nunca reaproveita o save do
 * ProductForm.
 *
 * Dois estados propositalmente separados: `draftFitByProduct` (o que está
 * marcado na tela agora, muda a cada clique num chip) e
 * `persistedFitByProduct` (o que realmente já foi salvo pela RPC — só muda
 * depois de um save bem-sucedido). Pendentes/Revisados é calculado SEMPRE a
 * partir do persistido, nunca do draft — senão o card migraria de aba só de
 * marcar um chip, antes de qualquer save de verdade acontecer.
 */
export function RevisarNumeracoesList({ items }: { items: SizeFitReviewProduct[] }) {
  const [tab, setTab] = useState<Tab>("pending");
  const initialFitByProduct = () =>
    Object.fromEntries(
      items.map((item) => [
        item.productId,
        Object.fromEntries(item.labels.map((l) => [l.labelSize, l.fitSizes])),
      ])
    );
  const [draftFitByProduct, setDraftFitByProduct] =
    useState<Record<string, Record<string, number[]>>>(initialFitByProduct);
  const [persistedFitByProduct, setPersistedFitByProduct] =
    useState<Record<string, Record<string, number[]>>>(initialFitByProduct);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorByProduct, setErrorByProduct] = useState<Record<string, string>>({});
  const cardRefs = useRef<Record<string, HTMLLIElement | null>>({});

  function isItemPending(item: SizeFitReviewProduct): boolean {
    const fit = persistedFitByProduct[item.productId] ?? {};
    return item.labels.some((l) => (fit[l.labelSize] ?? []).length === 0);
  }

  const pendingItems = items.filter(isItemPending);
  const reviewedItems = items.filter((i) => !isItemPending(i));
  const visibleItems = tab === "pending" ? pendingItems : reviewedItems;

  // Contagem secundária (informativa) — o badge do menu e a aba contam
  // PRODUTOS pendentes (um card = um produto, mesmo que ele tenha vários
  // tamanhos pendentes); esta linha só complementa mostrando também quantos
  // pares (produto, tamanho da etiqueta) individuais ainda faltam revisar.
  // Também calculada a partir do persistido, pelo mesmo motivo do isPending.
  const pendingLabelPairCount = pendingItems.reduce((sum, item) => {
    const fit = persistedFitByProduct[item.productId] ?? {};
    return sum + item.labels.filter((l) => (fit[l.labelSize] ?? []).length === 0).length;
  }, 0);

  async function handleSave(item: SizeFitReviewProduct, advanceToId: string | null) {
    setSavingId(item.productId);
    setErrorByProduct((prev) => {
      if (!(item.productId in prev)) return prev;
      const next = { ...prev };
      delete next[item.productId];
      return next;
    });

    const draft = draftFitByProduct[item.productId] ?? {};
    const payload = [
      {
        product_id: item.productId,
        sizes: item.labels.map((l) => ({ label_size: l.labelSize, fit_sizes: draft[l.labelSize] ?? [] })),
      },
    ];

    const result = await saveProductSizeFitCompatibilityAction(payload);
    setSavingId(null);

    if ("error" in result) {
      // Falhou: não toca no persistido (card não migra de aba, contador não
      // muda) e não mexe no draft (a administradora não perde o que marcou).
      setErrorByProduct((prev) => ({ ...prev, [item.productId]: result.error }));
      return;
    }

    // Só agora, com a RPC confirmando sucesso, o draft vira persistido —
    // é o único lugar que pode fazer isPending mudar e o card trocar de aba.
    setPersistedFitByProduct((prev) => ({ ...prev, [item.productId]: draft }));

    if (advanceToId) {
      requestAnimationFrame(() => {
        cardRefs.current[advanceToId]?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
        Nenhum produto com tamanho cadastrado encontrado com esses filtros.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <TabButton label={`Pendentes (${pendingItems.length})`} active={tab === "pending"} onClick={() => setTab("pending")} />
        <TabButton label={`Revisados (${reviewedItems.length})`} active={tab === "reviewed"} onClick={() => setTab("reviewed")} />
        {pendingItems.length > 0 && (
          <span className="text-xs text-text-muted">
            {pendingItems.length} {pendingItems.length === 1 ? "produto" : "produtos"} · {pendingLabelPairCount}{" "}
            {pendingLabelPairCount === 1 ? "tamanho" : "tamanhos"} para revisar
          </span>
        )}
      </div>

      {visibleItems.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-text-muted">
          {tab === "pending" ? "Nenhuma pendência com esses filtros." : "Nenhum produto revisado com esses filtros."}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visibleItems.map((item, index) => {
            const nextItem = visibleItems[index + 1] ?? null;
            return (
              <li
                key={item.productId}
                ref={(el) => {
                  cardRefs.current[item.productId] = el;
                }}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3.5"
              >
                <div className="flex gap-3">
                  <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {item.mainImageUrl ? (
                      <Image src={item.mainImageUrl} alt={item.name} fill sizes="64px" className="object-cover" />
                    ) : (
                      <div className="flex h-full items-center justify-center text-[9px] text-text-muted">Sem foto</div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-text">{item.name}</span>
                    <span className="block text-xs text-text-muted">
                      {item.code} · {item.colorName ?? "Sem cor"} · {item.categoryName ?? "Sem categoria"}
                    </span>
                  </div>
                </div>

                <SizeFitCompatibilityFields
                  labelSizes={item.labels.map((l) => l.labelSize)}
                  value={draftFitByProduct[item.productId] ?? {}}
                  onChange={(next) => setDraftFitByProduct((prev) => ({ ...prev, [item.productId]: next }))}
                />

                {errorByProduct[item.productId] && (
                  <p className="text-sm text-red-600">{errorByProduct[item.productId]}</p>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={savingId === item.productId}
                    onClick={() => handleSave(item, null)}
                    className="rounded-full border border-border px-4 py-2 text-sm font-medium text-text hover:bg-muted disabled:opacity-50"
                  >
                    {savingId === item.productId ? "Salvando..." : "Salvar"}
                  </button>
                  {nextItem && (
                    <button
                      type="button"
                      disabled={savingId === item.productId}
                      onClick={() => handleSave(item, nextItem.productId)}
                      className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      {savingId === item.productId ? "Salvando..." : "Salvar e próxima"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-text-muted hover:bg-muted"
      )}
    >
      {label}
    </button>
  );
}
