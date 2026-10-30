"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { formatBRL } from "@/lib/fulfillment/format";
import type { EditRecordSaleResult } from "./sale-details-actions";

export interface EditRecordSaleCurrent {
  saleTotal: number | null;
  saleDate: string;
  sellerId: string | null;
  salesOrigin: string | null;
}

/**
 * EDITAR DADOS DA VENDA (pós-aprovação): só vendedora, data e origem. O valor
 * aparece só como texto fixo — não existe nenhum <input name="saleTotal"> neste
 * formulário, então não há como editá-lo por aqui (decisão de negócio: o valor
 * já participou da conferência contra a NF-e e fica travado nesta versão).
 */
export function EditRecordSaleModal({
  recordId,
  current,
  sellers,
  action,
}: {
  recordId: string;
  current: EditRecordSaleCurrent;
  sellers: { id: string; name: string; active: boolean }[];
  action: (recordId: string, raw: Record<string, string>) => Promise<EditRecordSaleResult>;
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
      const result = await action(recordId, raw);
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
        EDITAR DADOS DA VENDA
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
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">Editar dados da venda</h2>
          <button type="button" onClick={close} aria-label="Fechar" className="shrink-0 rounded-full p-1.5 text-text-muted hover:bg-muted hover:text-text">
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-0.5">
          <span className="text-xs uppercase tracking-wide text-text-muted">Valor da venda</span>
          <span className="text-sm text-text">{current.saleTotal !== null ? formatBRL(Number(current.saleTotal)) : "—"}</span>
          <span className="text-xs text-text-muted">Não pode ser editado depois da aprovação.</span>
        </div>

        <Input id="editRecordSaleDate" name="saleDate" type="date" label="Data da venda" defaultValue={current.saleDate} error={errorFor("saleDate")} />

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">Vendedora</span>
          <select name="sellerId" defaultValue={current.sellerId ?? ""} className="h-11 rounded-xl border border-border bg-surface px-3 text-sm">
            <option value="">Vendedora não informada</option>
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {!s.active ? " (inativa)" : ""}
              </option>
            ))}
          </select>
          {errorFor("sellerId") && <p className="text-xs text-red-600">{errorFor("sellerId")}</p>}
        </label>

        <Input
          id="editRecordSalesOrigin"
          name="salesOrigin"
          label="Origem da venda"
          defaultValue={current.salesOrigin ?? ""}
          placeholder="ONLINE"
          error={errorFor("salesOrigin")}
        />

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
