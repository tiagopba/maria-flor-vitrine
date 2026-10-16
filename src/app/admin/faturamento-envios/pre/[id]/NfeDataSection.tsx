"use client";

import { Check, Copy, IdCard } from "lucide-react";
import { useState } from "react";

/**
 * Um campo + botão de copiar — só aquele valor, nunca "copiar todos". Clique
 * troca o ícone por um Check verde por 1,5s e mostra "Copiado" ao lado; sem
 * nenhuma chamada ao servidor (só navigator.clipboard), então nunca gera
 * audit log nem UPDATE.
 */
function CopyField({ label, value }: { label: string; value: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-admin-border/60 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <dt className="text-xs uppercase tracking-wide text-text-muted">{label}</dt>
        <dd className="break-words text-sm text-text">{value || "—"}</dd>
      </div>
      {value && (
        <div className="flex shrink-0 items-center gap-1.5">
          {copied && <span className="text-xs font-medium text-emerald-600">Copiado</span>}
          <button
            type="button"
            onClick={copy}
            aria-label={`Copiar ${label}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-muted hover:bg-admin-surface-muted hover:text-text active:bg-admin-surface-muted"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" strokeWidth={2} aria-hidden="true" /> : <Copy className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
          </button>
        </div>
      )}
    </div>
  );
}

export interface NfeDataFields {
  name: string | null;
  cpf: string | null;
  email: string | null;
  whatsapp: string | null;
  postalCode: string | null;
  addressLine: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  recipientName: string | null;
}

/**
 * "DADOS PARA EMISSÃO DA NF-e" — cada campo copia só o próprio valor. Nome,
 * rua, complemento, bairro, cidade, UF e destinatário já chegam em CAIXA
 * ALTA (o chamador aplica — ver [id]/page.tsx; nunca grava nada, só exibe).
 */
export function NfeDataSection({ fields }: { fields: NfeDataFields }) {
  return (
    <section className="rounded-2xl border border-admin-border bg-white p-5 shadow-[0_1px_2px_rgba(20,10,20,0.04),0_8px_24px_-16px_rgba(20,10,20,0.12)]">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-admin-primary-soft">
          <IdCard className="h-[18px] w-[18px] text-admin-primary" strokeWidth={1.75} />
        </div>
        <div>
          <h2 className="font-semibold text-text">Dados para emissão da NF-e</h2>
          <p className="text-xs text-text-muted">Clique no ícone pra copiar só aquele campo.</p>
        </div>
      </div>

      <dl className="flex flex-col">
        <CopyField label="Nome" value={fields.name} />
        <CopyField label="CPF" value={fields.cpf} />
        <CopyField label="E-mail" value={fields.email} />
        <CopyField label="WhatsApp" value={fields.whatsapp} />
        <CopyField label="CEP" value={fields.postalCode} />
        <CopyField label="Rua" value={fields.addressLine} />
        <CopyField label="Número" value={fields.addressNumber} />
        <CopyField label="Complemento" value={fields.addressComplement} />
        <CopyField label="Bairro" value={fields.neighborhood} />
        <CopyField label="Cidade" value={fields.city} />
        <CopyField label="UF" value={fields.state} />
        {fields.recipientName && <CopyField label="Destinatário" value={fields.recipientName} />}
      </dl>
    </section>
  );
}
