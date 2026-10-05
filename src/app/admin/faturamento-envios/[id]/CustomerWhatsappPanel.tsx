"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { updateCustomerWhatsappAction } from "./customer-whatsapp-actions";

/** Mostra o WhatsApp atual (já formatado no servidor) e permite adicionar ou editar. */
export function CustomerWhatsappPanel({ recordId, display }: { recordId: string; display: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const result = await updateCustomerWhatsappAction(recordId, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setEditing(false);
      setValue("");
      router.refresh();
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">WhatsApp do cliente</h2>
      {!editing ? (
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-text">{display ?? "Não cadastrado"}</span>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => {
              setValue(display ?? "");
              setEditing(true);
            }}
          >
            {display ? "EDITAR WHATSAPP" : "ADICIONAR WHATSAPP"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Input
            id="customerWhatsappEdit"
            label="Celular com DDD"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="tel"
            autoComplete="off"
            placeholder="(67) 99999-9999"
            error={error ?? undefined}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={pending} onClick={save}>
              SALVAR WHATSAPP
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setError(null);
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}
      {!editing && error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
