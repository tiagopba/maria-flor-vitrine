"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

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
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="flex items-center gap-2 text-sm text-text">
        <span className="break-words">{value || "—"}</span>
        {value && (
          <button
            type="button"
            onClick={copy}
            aria-label={`Copiar ${label}`}
            className="shrink-0 rounded-full p-1 text-text-muted hover:bg-muted hover:text-text"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
          </button>
        )}
        {copied && <span className="text-xs text-emerald-600">Copiado</span>}
      </dd>
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

/** Cada campo copia só o próprio valor — sem "copiar todos". */
export function NfeDataSection({ fields }: { fields: NfeDataFields }) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
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
  );
}
