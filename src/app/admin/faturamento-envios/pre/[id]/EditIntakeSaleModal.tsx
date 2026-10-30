"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { EditIntakeSaleResult } from "./sale-details-actions";

export interface EditIntakeSaleCurrent {
  saleTotal: number;
  saleDate: string;
  sellerId: string | null;
}

/**
 * EDITAR VENDA (pré-aprovação): valor, data e vendedora. `hasAnyAttempt` só decide
 * se o aviso de "a conferência vai deixar de valer" aparece — a regra de verdade
 * (forçar DOCUMENTS_PENDING) é recalculada no servidor, nunca confiada à tela.
 */
export function EditIntakeSaleModal({
  intakeId,
  current,
  sellers,
  hasAnyAttempt,
  action,
}: {
  intakeId: string;
  current: EditIntakeSaleCurrent;
  sellers: { id: string; name: string }[];
  hasAnyAttempt: boolean;
  action: (intakeId: string, raw: Record<string, string>) => Promise<EditIntakeSaleResult>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const errorFor = (name: string) => fieldErrors[name] || undefined;

  function close() {
    setOpen(false);
    setError(null);
    setFieldErrors({});
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const raw = Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)]));
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await action(intakeId, raw);
      if (!result.ok) {
        setError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      close();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        EDITAR VENDA
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 pt-12 sm:pt-20" onClick={close}>
      <form
        onSubmit={submit}
        autoComplete="off"
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-md flex-col gap-4 rounded-2xl border border-primary/30 bg-surface p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Editar venda</h2>
          <button type="button" onClick={close} aria-label="Fechar" className="shrink-0 rounded-full p-1.5 text-text-muted hover:bg-muted hover:text-text">
            ✕
          </button>
        </div>

        <Input
          id="editSaleTotal"
          name="saleTotal"
          label="Valor da venda (R$)"
          defaultValue={current.saleTotal.toFixed(2).replace(".", ",")}
          inputMode="decimal"
          placeholder="139,99"
          error={errorFor("saleTotal")}
        />

        {hasAnyAttempt && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Ao alterar o valor, a conferência atual deixará de ser válida e será necessário refazer a conferência.
          </p>
        )}

        <Input id="editSaleDate" name="saleDate" type="date" label="Data da venda" defaultValue={current.saleDate} error={errorFor("saleDate")} />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">Vendedora</span>
          <select
            name="sellerId"
            defaultValue={current.sellerId ?? ""}
            required
            className="h-11 rounded-xl border border-border bg-surface px-3 text-sm"
          >
            <option value="" disabled>
              Escolha a vendedora
            </option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {errorFor("sellerId") && <p className="text-xs text-red-600">{errorFor("sellerId")}</p>}
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Salvando..." : "SALVAR ALTERAÇÕES"}
          </Button>
          <Button type="button" variant="ghost" disabled={pending} onClick={close}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}
