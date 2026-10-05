"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { formatStoreDateTime } from "@/lib/fulfillment/format";
import type { Availability, PostSaleKind, PostSaleState } from "@/lib/fulfillment/post-sale";
import { POST_SALE_LABELS } from "@/lib/fulfillment/post-sale";
import { CopyButton } from "./CopyButton";
import { registerPostSaleEvent } from "./post-sale-actions";

export interface PostSaleItem {
  kind: PostSaleKind;
  message: string | null;
  /** null quando não há WhatsApp cadastrado para o cliente. */
  url: string | null;
  availability: Availability;
  state: PostSaleState;
}

/** "05/10/2026, 16:43" → "05/10/2026 às 16:43" */
const atText = (iso: string) => formatStoreDateTime(iso).replace(", ", " às ");

function Status({ item }: { item: PostSaleItem }) {
  if (item.state.state === "confirmed" && item.state.confirmed) {
    return (
      <p className="text-sm text-text">
        <span className="font-medium">Enviado em {atText(item.state.confirmed.created_at)}</span>
        {item.state.confirmed.actor_name ? ` por ${item.state.confirmed.actor_name}` : ""}
      </p>
    );
  }
  if (item.state.state === "opened" && item.state.opened) {
    return (
      <p className="text-sm text-text">
        <span className="font-medium">WhatsApp aberto, envio ainda não confirmado</span>
        <span className="text-text-muted">
          {" "}
          · aberto em {atText(item.state.opened.created_at)}
          {item.state.opened.actor_name ? ` por ${item.state.opened.actor_name}` : ""}
        </span>
      </p>
    );
  }
  return <p className="text-sm text-text-muted">Ainda não enviada</p>;
}

function ActionBlock({ item, recordId, onDone }: { item: PostSaleItem; recordId: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (phase: "opened" | "confirmed") =>
    new Promise<boolean>((resolve) => {
      startTransition(async () => {
        const result = await registerPostSaleEvent(recordId, item.kind, phase);
        if (!result.ok) {
          setError(result.error);
          resolve(false);
          return;
        }
        setError(null);
        onDone();
        resolve(true);
      });
    });

  /** Só abre o WhatsApp depois que o registro do clique deu certo. Abrir ≠ enviado. */
  const openWhatsapp = async () => {
    if (!item.url) return;
    const ok = await run("opened");
    if (ok) window.open(item.url, "_blank", "noopener");
  };

  const confirmSent = () => {
    if (!window.confirm("Confirma que você já enviou esta mensagem pelo WhatsApp?")) return;
    void run("confirmed");
  };

  const canOpen = item.availability.enabled && Boolean(item.url);
  const canConfirm = item.availability.enabled && item.state.state === "opened";

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-text">{POST_SALE_LABELS[item.kind]}</h3>
        <Status item={item} />
      </div>

      {item.message && (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-3 text-xs text-text">{item.message}</pre>
      )}

      {!item.availability.enabled && item.availability.reason && (
        <p className="text-sm text-text-muted">{item.availability.reason}</p>
      )}

      {item.availability.enabled && !item.url && (
        <p className="text-sm text-text-muted">
          Este cliente não tem WhatsApp cadastrado, então não é possível abrir a conversa automaticamente. Copie a mensagem e envie pelo WhatsApp.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {item.message && <CopyButton value={item.message} label="COPIAR MENSAGEM" />}
        <Button type="button" size="sm" disabled={!canOpen || pending} onClick={openWhatsapp}>
          ABRIR WHATSAPP
        </Button>
        {canConfirm && (
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={confirmSent}>
            CONFIRMAR QUE ENVIEI
          </Button>
        )}
      </div>

      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function PostSalePanel({ recordId, items }: { recordId: string; items: PostSaleItem[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-text-muted">Pós-venda</h2>
      <p className="mb-4 text-xs text-text-muted">
        Nada é enviado automaticamente. Abrir o WhatsApp só registra a abertura; o envio fica pendente até você confirmar.
      </p>
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <ActionBlock key={item.kind} item={item} recordId={recordId} onDone={refresh} />
        ))}
      </div>
    </section>
  );
}

