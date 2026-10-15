"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CARRIER_OPTIONS } from "@/lib/fulfillment/post-sale";
import type { SaveTrackingResult } from "./tracking-actions";

const SELECT_CLASS =
  "h-11 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary";

/**
 * Formulário de "SALVAR RASTREAMENTO": transportadora fechada (J&T Express /
 * Correios, nunca inferida pelo padrão do código) + código obrigatório. Usado
 * tanto no detalhe de um registro quanto na tela de bloqueio de Nova Venda —
 * `action` já vem com o destino do redirect amarrado (`saveTrackingAction.bind(null, returnTo)`).
 */
export function TrackingForm({
  recordId,
  carrier,
  action,
}: {
  recordId: string;
  /** Transportadora já extraída (ex.: do XML), se vier — nasce pré-selecionada, mas pode ser corrigida. */
  carrier: string | null;
  action: (recordId: string, formData: FormData) => Promise<SaveTrackingResult>;
}) {
  const initialCarrier = carrier && (CARRIER_OPTIONS as readonly string[]).includes(carrier) ? carrier : "";
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const errorFor = (name: string) => fieldErrors[name] || undefined;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const response = await action(recordId, formData);
      // Em caso de sucesso a action redireciona e nunca retorna.
      if (response && !response.ok) {
        setError(response.error);
        setFieldErrors(response.fieldErrors ?? {});
      }
    });
  }

  return (
    <form onSubmit={submit} autoComplete="off" className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`carrier-${recordId}`} className="text-sm font-medium text-text">
          Transportadora
        </label>
        <select id={`carrier-${recordId}`} name="carrier" defaultValue={initialCarrier} className={SELECT_CLASS} required>
          <option value="" disabled>
            Selecione…
          </option>
          {CARRIER_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        {errorFor("carrier") && <p className="text-xs text-red-600">{errorFor("carrier")}</p>}
      </div>

      <Input
        id={`trackingCode-${recordId}`}
        name="trackingCode"
        label="Código de rastreamento"
        className="font-mono"
        autoComplete="off"
        required
        error={errorFor("trackingCode")}
      />

      <Button type="submit" disabled={pending}>
        {pending ? "Salvando..." : "SALVAR RASTREAMENTO"}
      </Button>

      {error && <p className="w-full text-sm text-red-600">{error}</p>}
    </form>
  );
}
