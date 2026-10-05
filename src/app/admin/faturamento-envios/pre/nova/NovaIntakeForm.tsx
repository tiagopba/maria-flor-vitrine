"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { CopyButton } from "@/app/admin/faturamento-envios/[id]/CopyButton";
import { PAYMENT_LABELS, PAYMENT_METHODS } from "@/lib/intake/payment";
import { buildIntakeLinkMessage } from "@/lib/intake/messages";
import { createIntakeAction } from "../actions";

type Created = { id: string; link: string; whatsappUrl: string | null; customerName: string };

export function NovaIntakeForm({ sellers }: { sellers: { id: string; name: string }[] }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const data = new FormData(e.currentTarget);
    const raw = Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)]));
    startTransition(async () => {
      const result = await createIntakeAction(raw);
      if (!result.ok) {
        setFormError(result.error);
        setErrors(result.fieldErrors ?? {});
        return;
      }
      setCreated({ id: result.id, link: result.link, whatsappUrl: result.whatsappUrl, customerName: raw.customerName ?? "" });
    });
  };

  if (created) {
    return (
      <div className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5">
        <p className="font-medium text-text">Link gerado. Válido por 7 dias.</p>
        <p className="break-all rounded-xl bg-muted p-3 font-mono text-xs text-text">{created.link}</p>
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-muted p-3 text-xs text-text">
          {buildIntakeLinkMessage(created.customerName, created.link)}
        </pre>
        <div className="flex flex-wrap gap-2">
          <CopyButton value={created.link} label="COPIAR LINK" />
          {created.whatsappUrl ? (
            <a
              href={created.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-9 items-center justify-center rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              ABRIR WHATSAPP
            </a>
          ) : (
            <p className="text-sm text-text-muted">Cliente sem WhatsApp válido: copie o link e envie manualmente.</p>
          )}
        </div>
        <Link href={`/admin/faturamento-envios/pre/${created.id}`} className="text-sm text-text-muted hover:text-text">
          Abrir a solicitação →
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5" noValidate>
      <Input id="customerName" name="customerName" label="Cliente *" error={errors.customerName} autoComplete="off" />
      <Input id="customerWhatsapp" name="customerWhatsapp" label="WhatsApp do cliente *" error={errors.customerWhatsapp} placeholder="(67) 99999-9999" inputMode="tel" autoComplete="off" />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text">Vendedora *</span>
        <select name="sellerId" defaultValue="" required className="h-11 rounded-xl border border-border bg-surface px-3 text-sm">
          <option value="" disabled>
            Escolha a vendedora
          </option>
          {sellers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {errors.sellerId && <p className="text-xs text-red-600">{errors.sellerId}</p>}
      </label>

      <Input id="sti3SaleId" name="sti3SaleId" label="Número da venda STI3 *" error={errors.sti3SaleId} autoComplete="off" />

      <Input id="saleDate" name="saleDate" label="Data da venda *" type="date" error={errors.saleDate} />
      <Input id="saleTotal" name="saleTotal" label="Valor da venda (R$) *" error={errors.saleTotal} inputMode="decimal" placeholder="139,99" />

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text">Forma de pagamento *</span>
        <select name="paymentMethod" defaultValue="" required className="h-11 rounded-xl border border-border bg-surface px-3 text-sm">
          <option value="" disabled>
            Escolha a forma de pagamento
          </option>
          {PAYMENT_METHODS.map((m) => (
            <option key={m} value={m}>
              {PAYMENT_LABELS[m]}
            </option>
          ))}
        </select>
        {errors.paymentMethod && <p className="text-xs text-red-600">{errors.paymentMethod}</p>}
      </label>

      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text">Observação interna</span>
        <textarea name="internalNotes" rows={3} className="rounded-xl border border-border bg-surface p-3 text-sm" />
        {errors.internalNotes && <p className="text-xs text-red-600">{errors.internalNotes}</p>}
      </label>

      {formError && (
        <p role="alert" className="text-sm text-red-700">
          {formError}
        </p>
      )}

      <Button type="submit" disabled={pending}>
        GERAR LINK PARA CLIENTE
      </Button>
    </form>
  );
}
