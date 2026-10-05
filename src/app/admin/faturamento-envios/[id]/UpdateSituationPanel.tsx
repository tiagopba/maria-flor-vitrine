"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DELIVERY_STATUSES, DELIVERY_STATUS_LABELS, type DeliveryStatus } from "@/lib/fulfillment/delivery";
import { formatIsoDate } from "@/lib/fulfillment/format";
import type { UpdateDeliveryResult } from "./actions";

export interface SituationRecord {
  id: string;
  delivery_status: DeliveryStatus;
  expected_delivery_date: string | null;
  delivered_at: string | null;
  notes: string | null;
  carrier: string | null;
  shipping_service: string | null;
  tracking_code: string | null;
}

const SELECT_CLASS =
  "h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary";

export function UpdateSituationPanel({
  record,
  action: updateDeliveryAction,
}: {
  record: SituationRecord;
  action: (id: string, formData: FormData) => Promise<UpdateDeliveryResult>;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string>(record.delivery_status);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const errorFor = (name: string) => fieldErrors[name] || undefined;
  // Sair de ENTREGUE com data registrada exige confirmar a remoção dessa data.
  const leavingDelivered = record.delivery_status === "DELIVERED" && Boolean(record.delivered_at) && status !== "DELIVERED";

  function close() {
    setOpen(false);
    setError(null);
    setFieldErrors({});
    setStatus(record.delivery_status);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const response = await updateDeliveryAction(record.id, formData);
      // Em caso de sucesso a action redireciona para esta mesma página e nunca retorna.
      if (response && !response.ok) {
        setError(response.error);
        setFieldErrors(response.fieldErrors ?? {});
      }
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        ATUALIZAR SITUAÇÃO
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      autoComplete="off"
      className="flex flex-col gap-4 rounded-2xl border border-primary/30 bg-surface p-5"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Atualizar situação</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="deliveryStatus" className="text-sm font-medium text-text">
            Status da entrega
          </label>
          <select
            id="deliveryStatus"
            name="deliveryStatus"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            className={SELECT_CLASS}
          >
            {DELIVERY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {DELIVERY_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
          {errorFor("deliveryStatus") && <p className="text-xs text-red-600">{errorFor("deliveryStatus")}</p>}
        </div>

        <Input
          id="expectedDeliveryDate"
          name="expectedDeliveryDate"
          type="date"
          label="Previsão de entrega"
          defaultValue={record.expected_delivery_date ?? ""}
          error={errorFor("expectedDeliveryDate")}
        />

        {status === "DELIVERED" && (
          <Input
            id="deliveredAt"
            name="deliveredAt"
            type="date"
            label="Entregue em (obrigatório)"
            defaultValue={record.delivered_at ?? ""}
            error={errorFor("deliveredAt")}
            required
          />
        )}

        {leavingDelivered && (
          <label className="flex items-start gap-2 text-sm text-amber-900 sm:col-span-2">
            <input type="checkbox" name="confirmClearDelivery" className="mt-0.5 h-4 w-4" />
            <span>
              Este registro consta como entregue em {formatIsoDate(record.delivered_at)}. Confirmo remover a data de
              entrega ao mudar o status.
              {errorFor("confirmClearDelivery") && (
                <span className="mt-1 block text-xs text-red-600">{errorFor("confirmClearDelivery")}</span>
              )}
            </span>
          </label>
        )}

        <Input
          id="carrier"
          name="carrier"
          label="Transportadora"
          defaultValue={record.carrier ?? ""}
          error={errorFor("carrier")}
          list="update-carrier-suggestions"
          autoComplete="off"
        />
        <datalist id="update-carrier-suggestions">
          <option value="J&T Express" />
          <option value="Correios" />
          <option value="Jadlog" />
          <option value="Loggi" />
          <option value="Total Express" />
        </datalist>
        <Input
          id="shippingService"
          name="shippingService"
          label="Serviço"
          defaultValue={record.shipping_service ?? ""}
          error={errorFor("shippingService")}
          list="update-service-suggestions"
          autoComplete="off"
        />
        <datalist id="update-service-suggestions">
          <option value="SEDEX" />
          <option value="PAC" />
        </datalist>
        <div className="sm:col-span-2">
          <Input
            id="trackingCode"
            name="trackingCode"
            label="Código de rastreio"
            defaultValue={record.tracking_code ?? ""}
            error={errorFor("trackingCode")}
            className="font-mono"
            autoComplete="off"
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="notes" className="text-sm font-medium text-text">
            Observações
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={record.notes ?? ""}
            className="rounded-lg border border-border bg-surface px-3.5 py-2.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          />
          {errorFor("notes") && <p className="text-xs text-red-600">{errorFor("notes")}</p>}
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando..." : "SALVAR SITUAÇÃO"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={close}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
