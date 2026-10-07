"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatStoreDateTime } from "@/lib/fulfillment/format";
import type { Availability, PostSaleKind, PostSaleState } from "@/lib/fulfillment/post-sale";
import { POST_SALE_LABELS } from "@/lib/fulfillment/post-sale";
import { CopyButton } from "./CopyButton";
import { registerPostSaleEvent } from "./post-sale-actions";

export interface PostSaleItem {
  kind: PostSaleKind;
  /** Mensagem atual, pelo modelo vigente — some quando já ENVIADO (usa messageSnapshot). */
  message: string | null;
  customerFirstName: string | null;
  /** null quando o cliente não tem WhatsApp cadastrado. */
  url: string | null;
  availability: Availability;
  state: PostSaleState;
}

/** "05/10/2026, 16:43" → "05/10/2026 às 16:43" */
const atText = (iso: string) => formatStoreDateTime(iso).replace(", ", " às ");

function StatusBadge({ status }: { status: PostSaleState["status"] }) {
  // OPEN nunca em vermelho: é pendência, não erro. SENT em verde, discreto.
  return status === "SENT" ? <Badge tone="success">✓ ENVIADO</Badge> : <Badge tone="warning">EM ABERTO</Badge>;
}

function ConfirmInline({ customerFirstName, pending, onCancel, onConfirm }: { customerFirstName: string | null; pending: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3">
      <p className="text-sm text-text">
        Confirma que esta mensagem foi realmente enviada{customerFirstName ? ` para ${customerFirstName}` : ""}?
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={onCancel}>
          Cancelar
        </Button>
        <Button type="button" size="sm" disabled={pending} onClick={onConfirm}>
          {pending ? "CONFIRMANDO…" : "CONFIRMAR ENVIO"}
        </Button>
      </div>
    </div>
  );
}

function ActionBlock({ item, recordId, onDone }: { item: PostSaleItem; recordId: string; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const sent = item.state.status === "SENT";

  /**
   * ABRIR WHATSAPP / REENVIAR — robusto contra popup blocker:
   * window.open() é chamado DENTRO do clique (com o gesto do usuário), antes de qualquer await.
   * A aba nasce vazia; só recebe o endereço do WhatsApp depois que o OPENED foi gravado.
   * Se a gravação falhar, a aba vazia é fechada e nada é aberto. Reenviar depois de ENVIADO
   * só reabre a conversa: não muda o status nem grava uma nova confirmação.
   */
  const openWhatsapp = () => {
    if (!item.url) return;
    const win = window.open("", "_blank");
    if (!win) {
      setError("O navegador bloqueou a nova aba. Permita pop-ups para este site e tente de novo.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await registerPostSaleEvent(recordId, item.kind, "opened");
      if (!result.ok) {
        win.close();
        setError(result.error);
        return;
      }
      win.opener = null;
      win.location.href = item.url!;
      onDone();
    });
  };

  const confirmSent = () => {
    startTransition(async () => {
      const result = await registerPostSaleEvent(recordId, item.kind, "confirmed");
      setConfirming(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      onDone();
    });
  };

  const canOpen = item.availability.enabled && Boolean(item.url);
  // Não exige ter aberto o WhatsApp por aqui: a funcionária pode ter enviado por outro
  // caminho (WhatsApp Desktop, celular, copiar e colar). CONFIRMAR é a fonte da verdade.
  const canConfirm = item.availability.enabled && item.state.status === "OPEN";
  const displayMessage = sent ? item.state.messageSnapshot : item.message;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-text">{POST_SALE_LABELS[item.kind]}</h3>
        <StatusBadge status={item.state.status} />
      </div>

      {sent ? (
        <p className="text-sm text-text">
          Enviado em {item.state.sentAt ? atText(item.state.sentAt) : "—"}
          <br />
          <span className="text-text-muted">Por {item.state.sentByName ?? "—"}</span>
        </p>
      ) : item.state.openedAt ? (
        <p className="text-sm text-text-muted">
          WhatsApp aberto em {atText(item.state.openedAt)}
          {item.state.openedByName ? ` por ${item.state.openedByName}` : ""} — envio ainda não confirmado
        </p>
      ) : (
        <p className="text-sm text-text-muted">Ainda não enviada</p>
      )}

      {sent && !item.state.messageSnapshot && <p className="text-xs text-text-muted">Mensagem histórica não armazenada.</p>}

      {displayMessage && (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-3 text-xs text-text">{displayMessage}</pre>
      )}

      {!item.availability.enabled && item.availability.reason && (
        <p className="text-sm text-text-muted">{item.availability.reason}</p>
      )}

      {item.availability.enabled && !item.url && (
        <p className="text-sm text-text-muted">Cadastre o WhatsApp do cliente para abrir a conversa.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {displayMessage && <CopyButton value={displayMessage} label="COPIAR MENSAGEM" />}
        <Button type="button" size="md" className="min-w-[44px]" disabled={!canOpen || pending} onClick={openWhatsapp}>
          {sent ? "REENVIAR PELO WHATSAPP" : "ABRIR WHATSAPP"}
        </Button>
        {canConfirm && !confirming && (
          <Button type="button" size="md" className="min-w-[44px]" variant="secondary" disabled={pending} onClick={() => setConfirming(true)}>
            ✓ CONFIRMAR QUE ENVIEI
          </Button>
        )}
      </div>

      {confirming && (
        <ConfirmInline customerFirstName={item.customerFirstName} pending={pending} onCancel={() => setConfirming(false)} onConfirm={confirmSent} />
      )}

      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}

export function PostSalePanel({ recordId, items }: { recordId: string; items: PostSaleItem[] }) {
  const router = useRouter();
  const refresh = () => router.refresh();
  const openCount = items.filter((i) => i.state.status !== "SENT").length;

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Pós-venda</h2>
        {openCount === 0 ? (
          <Badge tone="success">✓ Follow-ups concluídos</Badge>
        ) : (
          <Badge tone="warning">
            ● {openCount} em aberto
          </Badge>
        )}
      </div>
      <p className="mb-4 text-xs text-text-muted">
        Copiar ou abrir o WhatsApp não marca como enviado. Só CONFIRMAR QUE ENVIEI faz isso.
      </p>
      <div className="flex flex-col gap-4">
        {items.map((item) => (
          <ActionBlock key={item.kind} item={item} recordId={recordId} onDone={refresh} />
        ))}
      </div>
    </section>
  );
}
