import Link from "next/link";
import type { FulfillmentRecord } from "@/lib/db/fulfillment";
import { formatBRL, formatIsoDate, formatStoreDateTime } from "@/lib/fulfillment/format";
import { formatCpfCnpj, formatPostalCode } from "@/lib/fulfillment/text";
import { CopyButton } from "./CopyButton";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="break-words text-sm text-text">{children || "—"}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-5">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">{title}</h2>
      <dl className="grid gap-4 sm:grid-cols-2">{children}</dl>
    </section>
  );
}

const documentButton =
  "inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90";

export function RecordDetailView({ record }: { record: FulfillmentRecord }) {
  return (
    <div className="max-w-3xl">
      <Link href="/admin/faturamento-envios" className="text-sm text-text-muted hover:text-text">
        ← Faturamento e Envios
      </Link>
      <h1 className="mb-1 mt-2 font-display text-2xl text-text">{record.customer_name}</h1>
      <p className="mb-6 text-sm text-text-muted">Registrado em {formatStoreDateTime(record.created_at)}</p>

      <div className="mb-5 flex flex-wrap gap-3">
        {/* Abre o PDF servido pelo servidor (sessão Admin + RLS) — nunca uma URL pública. */}
        <a
          href={`/admin/faturamento-envios/${record.id}/arquivo/danfe`}
          target="_blank"
          rel="noopener noreferrer"
          className={documentButton}
        >
          VER DANFE
        </a>
        <a
          href={`/admin/faturamento-envios/${record.id}/arquivo/etiqueta`}
          target="_blank"
          rel="noopener noreferrer"
          className={documentButton}
        >
          VER ETIQUETA
        </a>
      </div>

      <div className="flex flex-col gap-5">
        <Section title="Cliente">
          <Field label="Nome">{record.customer_name}</Field>
          <Field label="CPF">
            <span className="font-mono">{record.customer_cpf ? formatCpfCnpj(record.customer_cpf) : ""}</span>
          </Field>
          <Field label="Endereço">{record.address_line}</Field>
          <Field label="Número">{record.address_number}</Field>
          <Field label="Complemento">{record.address_complement}</Field>
          <Field label="Bairro">{record.neighborhood}</Field>
          <Field label="CEP">{record.postal_code ? formatPostalCode(record.postal_code) : ""}</Field>
          <Field label="Cidade/UF">{[record.city, record.state].filter(Boolean).join(" / ")}</Field>
        </Section>

        <Section title="NF-e">
          <Field label="Número">{record.nfe_number}</Field>
          <Field label="Série">{record.nfe_series}</Field>
          <Field label="Emissão">{record.nfe_issued_at ? formatIsoDate(record.nfe_issued_at) : ""}</Field>
          <Field label="Valor">{record.invoice_total != null ? formatBRL(record.invoice_total) : ""}</Field>
          <Field label="Itens">{record.items_count != null ? String(record.items_count) : ""}</Field>
          <Field label="Protocolo">
            <span className="font-mono">{record.nfe_protocol}</span>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Chave de acesso">
              <span className="break-all font-mono">{record.nfe_key}</span>
            </Field>
          </div>
        </Section>

        <Section title="Envio">
          <Field label="Transportadora">{record.carrier}</Field>
          <Field label="Data da etiqueta">
            {record.shipping_label_date ? formatStoreDateTime(record.shipping_label_date) : ""}
          </Field>
          <div className="sm:col-span-2">
            <Field label="Código de rastreio">
              {record.tracking_code ? (
                <span className="flex flex-wrap items-center gap-3">
                  <span className="select-all font-mono text-base font-semibold">{record.tracking_code}</span>
                  <CopyButton value={record.tracking_code} label="Copiar rastreio" />
                </span>
              ) : (
                ""
              )}
            </Field>
          </div>
        </Section>
      </div>
    </div>
  );
}
