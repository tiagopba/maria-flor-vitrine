"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PAYMENT_LABELS, PAYMENT_METHODS } from "@/lib/intake/payment";
import { EDIT_NOTE_MAX, EDIT_REASONS, EDIT_REASON_LABELS, type EditReason } from "@/lib/intake/edit";
import { editIntakeAction } from "./edit-actions";

export interface EditIntakeInitial {
  sti3SaleId: string;
  customerName: string;
  customerWhatsapp: string;
  sellerId: string;
  saleDate: string;
  saleTotal: string;
  paymentMethod: string;
  internalNotes: string;
  submittedName: string;
  submittedCpf: string;
  submittedEmail: string;
  submittedWhatsapp: string;
  submittedDeliveryToCustomer: boolean;
  submittedRecipientName: string;
  submittedPostalCode: string;
  submittedAddressLine: string;
  submittedAddressNumber: string;
  submittedAddressComplement: string;
  submittedNeighborhood: string;
  submittedCity: string;
  submittedState: string;
}

/** EDITAR DADOS: Admin/Master corrige dados já gravados, antes da aprovação. Motivo obrigatório. */
export function EditIntakePanel({
  intakeId,
  sellers,
  received,
  initial,
}: {
  intakeId: string;
  sellers: { id: string; name: string }[];
  received: boolean;
  initial: EditIntakeInitial;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deliveryToCustomer, setDeliveryToCustomer] = useState(initial.submittedDeliveryToCustomer);
  const [reason, setReason] = useState<EditReason | "">("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError(null);
    setFieldErrors({});
    const data = new FormData(e.currentTarget);
    const raw: Record<string, unknown> = Object.fromEntries([...data.entries()].map(([k, v]) => [k, String(v)]));
    raw.submittedDeliveryToCustomer = deliveryToCustomer;
    startTransition(async () => {
      const result = await editIntakeAction(intakeId, raw);
      if (!result.ok) {
        setFormError(result.error);
        setFieldErrors(result.fieldErrors ?? {});
        return;
      }
      setOpen(false);
      setReason("");
      setNote("");
      router.refresh();
    });
  };

  if (!open) {
    return (
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        EDITAR DADOS
      </Button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 rounded-2xl border border-border bg-muted/40 p-5" noValidate>
      <p className="font-medium text-text">Editar dados da solicitação</p>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-semibold uppercase tracking-wide text-text-muted">Venda</legend>
        <Input id="sti3SaleId" name="sti3SaleId" label="Número da venda STI3 *" defaultValue={initial.sti3SaleId} error={fieldErrors.sti3SaleId} autoComplete="off" />
        <Input id="customerName" name="customerName" label="Cliente *" defaultValue={initial.customerName} error={fieldErrors.customerName} autoComplete="off" />
        <Input
          id="customerWhatsapp"
          name="customerWhatsapp"
          label="WhatsApp do cliente *"
          defaultValue={initial.customerWhatsapp}
          error={fieldErrors.customerWhatsapp}
          inputMode="tel"
          autoComplete="off"
        />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">Vendedora *</span>
          <select name="sellerId" defaultValue={initial.sellerId} required className="h-11 rounded-xl border border-border bg-surface px-3 text-sm">
            {sellers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {fieldErrors.sellerId && <p className="text-xs text-red-600">{fieldErrors.sellerId}</p>}
        </label>
        <Input id="saleDate" name="saleDate" label="Data da venda *" type="date" defaultValue={initial.saleDate} error={fieldErrors.saleDate} />
        <Input id="saleTotal" name="saleTotal" label="Valor da venda (R$) *" defaultValue={initial.saleTotal} error={fieldErrors.saleTotal} inputMode="decimal" />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">Forma de pagamento *</span>
          <select name="paymentMethod" defaultValue={initial.paymentMethod} required className="h-11 rounded-xl border border-border bg-surface px-3 text-sm">
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_LABELS[m]}
              </option>
            ))}
          </select>
          {fieldErrors.paymentMethod && <p className="text-xs text-red-600">{fieldErrors.paymentMethod}</p>}
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-text">Observação interna</span>
          <textarea name="internalNotes" rows={3} defaultValue={initial.internalNotes} className="rounded-xl border border-border bg-surface p-3 text-sm" />
          {fieldErrors.internalNotes && <p className="text-xs text-red-600">{fieldErrors.internalNotes}</p>}
        </label>
      </fieldset>

      {received && (
        <fieldset className="flex flex-col gap-4 border-t border-border pt-4">
          <legend className="text-sm font-semibold uppercase tracking-wide text-text-muted">Dados da cliente</legend>
          <p className="text-xs text-text-muted">
            Editar aqui invalida qualquer conferência já feita com o XML: a solicitação volta a exigir um novo envio.
          </p>
          <Input id="submittedName" name="submittedName" label="Nome completo *" defaultValue={initial.submittedName} error={fieldErrors.submittedName} autoComplete="off" />
          <Input id="submittedCpf" name="submittedCpf" label="CPF *" defaultValue={initial.submittedCpf} error={fieldErrors.submittedCpf} inputMode="numeric" autoComplete="off" />
          <Input id="submittedEmail" name="submittedEmail" label="E-mail *" defaultValue={initial.submittedEmail} error={fieldErrors.submittedEmail} type="email" autoComplete="off" />
          <Input
            id="submittedWhatsapp"
            name="submittedWhatsapp"
            label="WhatsApp da cliente *"
            defaultValue={initial.submittedWhatsapp}
            error={fieldErrors.submittedWhatsapp}
            inputMode="tel"
            autoComplete="off"
          />
          <label className="flex items-center gap-2.5 text-sm text-text">
            <input type="checkbox" checked={deliveryToCustomer} onChange={(e) => setDeliveryToCustomer(e.target.checked)} className="h-4 w-4" />
            Entregar para a própria cliente
          </label>
          {!deliveryToCustomer && (
            <Input
              id="submittedRecipientName"
              name="submittedRecipientName"
              label="Destinatário *"
              defaultValue={initial.submittedRecipientName}
              error={fieldErrors.submittedRecipientName}
              autoComplete="off"
            />
          )}
          <Input
            id="submittedPostalCode"
            name="submittedPostalCode"
            label="CEP *"
            defaultValue={initial.submittedPostalCode}
            error={fieldErrors.submittedPostalCode}
            inputMode="numeric"
            autoComplete="off"
          />
          <Input id="submittedAddressLine" name="submittedAddressLine" label="Rua *" defaultValue={initial.submittedAddressLine} error={fieldErrors.submittedAddressLine} autoComplete="off" />
          <Input
            id="submittedAddressNumber"
            name="submittedAddressNumber"
            label="Número *"
            defaultValue={initial.submittedAddressNumber}
            error={fieldErrors.submittedAddressNumber}
            autoComplete="off"
          />
          <Input
            id="submittedAddressComplement"
            name="submittedAddressComplement"
            label="Complemento"
            defaultValue={initial.submittedAddressComplement}
            error={fieldErrors.submittedAddressComplement}
            autoComplete="off"
          />
          <Input id="submittedNeighborhood" name="submittedNeighborhood" label="Bairro *" defaultValue={initial.submittedNeighborhood} error={fieldErrors.submittedNeighborhood} autoComplete="off" />
          <Input id="submittedCity" name="submittedCity" label="Cidade *" defaultValue={initial.submittedCity} error={fieldErrors.submittedCity} autoComplete="off" />
          <Input id="submittedState" name="submittedState" label="UF *" defaultValue={initial.submittedState} error={fieldErrors.submittedState} maxLength={2} autoComplete="off" />
        </fieldset>
      )}

      <fieldset className="flex flex-col gap-2 border-t border-border pt-4">
        <legend className="mb-1 text-sm font-medium text-text">Motivo da correção *</legend>
        {EDIT_REASONS.map((code) => (
          <label key={code} className="flex items-center gap-2.5 text-sm text-text">
            <input
              type="radio"
              name="reason"
              value={code}
              checked={reason === code}
              onChange={() => setReason(code)}
              className="h-4 w-4 accent-[var(--color-primary)]"
            />
            {EDIT_REASON_LABELS[code]}
          </label>
        ))}
        {fieldErrors.reason && <p className="text-xs text-red-600">{fieldErrors.reason}</p>}
      </fieldset>

      {reason === "OTHER" && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="editNote" className="text-sm font-medium text-text">
            Observação *
          </label>
          <textarea
            id="editNote"
            name="note"
            value={note}
            maxLength={EDIT_NOTE_MAX}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <p className="text-xs text-text-muted">
            Não entra no log de auditoria (que guarda só o código do motivo). {note.trim().length}/{EDIT_NOTE_MAX}
          </p>
          {fieldErrors.note && <p className="text-xs text-red-600">{fieldErrors.note}</p>}
        </div>
      )}

      {formError && (
        <p role="alert" className="text-sm text-red-700">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "SALVANDO…" : "SALVAR CORREÇÃO"}
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
