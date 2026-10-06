"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { CANCEL_NOTE_MAX, CANCEL_REASONS, CANCEL_REASON_LABELS, type CancelReason } from "@/lib/intake/cancel";
import { cancelIntakeAction } from "../actions";

/** CANCELAR VENDA: ação secundária. Confirmação explícita, motivo obrigatório. */
export function CancelIntakePanel({ intakeId }: { intakeId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<CancelReason | "">("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ reason?: string; note?: string }>({});
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    setFieldErrors({});
    startTransition(async () => {
      const result = await cancelIntakeAction(intakeId, { reason, note });
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      router.refresh();
    });
  }

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs text-text-muted">
          Use quando a cliente desistir da compra ou quando a venda tiver sido criada por engano. Nada é apagado.
        </p>
        <div>
          <Button type="button" variant="secondary" size="sm" className="text-red-700" onClick={() => setOpen(true)}>
            CANCELAR VENDA
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4">
      <div>
        <p className="font-medium text-text">Cancelar esta venda?</p>
        <p className="text-sm text-text-muted">Esta solicitação não poderá continuar para faturamento e envio.</p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-text">Motivo</legend>
        {CANCEL_REASONS.map((code) => (
          <label key={code} className="flex items-center gap-2.5 text-sm text-text">
            <input
              type="radio"
              name="cancelReason"
              value={code}
              checked={reason === code}
              onChange={() => setReason(code)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            {CANCEL_REASON_LABELS[code]}
          </label>
        ))}
        {fieldErrors.reason && <p className="text-xs text-red-600">{fieldErrors.reason}</p>}
      </fieldset>

      {reason === "OTHER" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cancelNote" className="text-sm font-medium text-text">
            Observação *
          </label>
          <textarea
            id="cancelNote"
            value={note}
            maxLength={CANCEL_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="text-xs text-text-muted">
            Curta. Fica só no registro privado, não no histórico de auditoria. {note.trim().length}/{CANCEL_NOTE_MAX}
          </p>
          {fieldErrors.note && <p className="text-xs text-red-600">{fieldErrors.note}</p>}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="danger" size="md" disabled={pending} onClick={confirm}>
          {pending ? "CANCELANDO…" : "CONFIRMAR CANCELAMENTO"}
        </Button>
        <Button type="button" variant="ghost" size="md" disabled={pending} onClick={() => setOpen(false)}>
          Voltar
        </Button>
      </div>
    </div>
  );
}
