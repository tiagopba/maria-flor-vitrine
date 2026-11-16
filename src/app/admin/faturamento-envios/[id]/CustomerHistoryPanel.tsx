"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { CustomerHistory } from "@/lib/db/customers";
import {
  CUSTOMER_REVIEW_STATUS_LABELS,
  REVIEW_ROW_STATE_LABELS,
  reviewRowState,
  type CustomerReviewStatus,
} from "@/lib/fulfillment/customer-review";
import { DELIVERY_STATUS_LABELS, type DeliveryStatus } from "@/lib/fulfillment/delivery";
import { formatIsoDate, formatStoreDateTime } from "@/lib/fulfillment/format";
import { setCustomerReviewOutcomeAction } from "./customer-review-actions";

const STATUS_TONE: Record<CustomerReviewStatus, "neutral" | "warning" | "success"> = {
  NEVER_ASKED: "neutral",
  REQUESTED: "warning",
  REVIEWED: "success",
  DISMISSED: "neutral",
  DOES_NOT_WANT: "neutral",
};

const OUTCOME_LABELS: Record<"REVIEWED" | "DISMISSED" | "DOES_NOT_WANT", string> = {
  REVIEWED: "✓ MARCAR AVALIAÇÃO REALIZADA",
  DISMISSED: "DISPENSAR AVALIAÇÃO",
  DOES_NOT_WANT: "CLIENTE NÃO DESEJA AVALIAR",
};

const EVENT_ACTION_LABELS: Record<string, string> = {
  REQUESTED: "Avaliação solicitada",
  REVIEWED: "Avaliação marcada como realizada",
  DISMISSED: "Avaliação dispensada",
  DOES_NOT_WANT: "Cliente marcada como não deseja avaliar",
  REOPENED: "Avaliação reaberta",
};

/** "05/10/2026, 16:43" → "05/10/2026 às 16:43" — mesma convenção do PostSalePanel. */
const atText = (iso: string) => formatStoreDateTime(iso).replace(", ", " às ");

/**
 * Histórico COMPLETO da cliente (todas as vendas vinculadas pelo mesmo CPF,
 * nunca só esta venda) — CPF sempre mascarado. As 3 ações manuais só mudam o
 * estado GLOBAL via set_customer_review_outcome (RPC, única forma de virar
 * REVIEWED/DISMISSED/DOES_NOT_WANT no banco) — nunca grava nada no
 * follow-up desta venda, nunca é automático.
 */
export function CustomerHistoryPanel({ recordId, history }: { recordId: string; history: CustomerHistory }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingOutcome, setPendingOutcome] = useState<"REVIEWED" | "DISMISSED" | "DOES_NOT_WANT" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setOutcome = (outcome: "REVIEWED" | "DISMISSED" | "DOES_NOT_WANT") => {
    setPendingOutcome(outcome);
    startTransition(async () => {
      const result = await setCustomerReviewOutcomeAction(recordId, history.customer.id, outcome);
      setPendingOutcome(null);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">Histórico da cliente</h2>

      <dl className="mb-4 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">CPF</dt>
          <dd className="font-mono text-sm text-text">{history.customer.cpfMasked}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-text-muted">Compras</dt>
          <dd className="text-sm text-text">{history.totalPurchases}</dd>
        </div>
        <div>
          <dt className="mb-1 text-xs uppercase tracking-wide text-text-muted">Situação da avaliação</dt>
          <dd>
            <Badge tone={STATUS_TONE[history.reviewStatus]}>{CUSTOMER_REVIEW_STATUS_LABELS[history.reviewStatus]}</Badge>
          </dd>
        </div>
      </dl>

      <div className="mb-2 flex flex-wrap gap-2">
        {(["REVIEWED", "DISMISSED", "DOES_NOT_WANT"] as const).map((outcome) => (
          <Button
            key={outcome}
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending || history.reviewStatus === outcome}
            onClick={() => setOutcome(outcome)}
          >
            {pendingOutcome === outcome ? "SALVANDO…" : OUTCOME_LABELS[outcome]}
          </Button>
        ))}
      </div>
      {error && (
        <p role="alert" className="mb-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 border-t border-border pt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Vendas desta cliente</h3>
        {history.sales.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhuma venda encontrada.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {history.sales.map((sale) => {
              // Mesma regra da listagem (reviewRowState): o follow-up DESTA venda +
              // o estado GLOBAL (único, já carregado acima) — nunca o follow-up isolado.
              const reviewFollowup = sale.followups.find((f) => f.type === "GOOGLE_REVIEW");
              const reviewState = reviewFollowup
                ? reviewRowState(reviewFollowup.status as "OPEN" | "SENT", history.reviewStatus)
                : null;
              return (
                <li
                  key={sale.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm ${
                    sale.id === recordId ? "border-primary/40 bg-primary/5" : "border-border/60"
                  }`}
                >
                  <span className="text-text">
                    {formatIsoDate(sale.saleDate)}
                    {sale.id === recordId && <span className="ml-2 text-xs text-primary">(esta venda)</span>}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-text-muted">
                    {DELIVERY_STATUS_LABELS[sale.deliveryStatus as DeliveryStatus] ?? sale.deliveryStatus}
                    {reviewState && <Badge tone="neutral">{REVIEW_ROW_STATE_LABELS[reviewState]}</Badge>}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="mt-4 border-t border-border pt-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Histórico de solicitações e respostas</h3>
        {history.reviewEvents.length === 0 ? (
          <p className="text-sm text-text-muted">Nenhum evento registrado ainda.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {history.reviewEvents.map((event, index) => (
              <li key={index} className="text-sm text-text">
                <span className="font-medium">{EVENT_ACTION_LABELS[event.action] ?? event.action}</span>
                <span className="text-text-muted"> — {atText(event.createdAt)} por {event.actorName ?? "—"}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
