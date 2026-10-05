import Link from "next/link";
import type { FulfillmentRecord } from "@/lib/db/fulfillment";
import { UNKNOWN_SELLER_LABEL, formatOriginLabel, statusesForSource } from "@/lib/fulfillment/delivery";
import { HISTORICAL_NO_DOCUMENTS_MESSAGE, documentAvailability } from "@/lib/fulfillment/documents";
import { formatBRL, formatCarrier, formatIsoDate, formatStoreDateTime } from "@/lib/fulfillment/format";
import { formatCpfCnpj, formatPostalCode } from "@/lib/fulfillment/text";
import { DeliveryStatusBadge } from "../RecordsTable";
import { CopyButton } from "./CopyButton";
import { updateDeliveryAction } from "./actions";
import { CustomerWhatsappPanel } from "./CustomerWhatsappPanel";
import { PostSalePanel, type PostSaleItem } from "./PostSalePanel";
import { UpdateSituationPanel } from "./UpdateSituationPanel";

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

export function RecordDetailView({
  record,
  sellerName,
  postSale,
  customerWhatsapp,
}: {
  record: FulfillmentRecord;
  /** Nome da vendedora de record.seller_id (public.sellers), quando houver. */
  sellerName: string | null;
  /** Pós-venda: mensagens, links e estados já calculados no servidor. */
  postSale: PostSaleItem[];
  /** WhatsApp do cliente já formatado para exibir (null = não cadastrado). */
  customerWhatsapp: string | null;
}) {
  const documents = documentAvailability(record);

  return (
    <div className="max-w-3xl">
      <Link href="/admin/faturamento-envios" className="text-sm text-text-muted hover:text-text">
        ← Faturamento e Envios
      </Link>
      <h1 className="mb-1 mt-2 font-display text-2xl text-text">{record.customer_name}</h1>
      <p className="mb-6 text-sm text-text-muted">
        Registrado em {formatStoreDateTime(record.created_at)}
        {record.record_source === "HISTORICAL_IMPORT" && " · Histórico (importado da planilha antiga)"}
      </p>

      {documents.any ? (
        <div className="mb-5 flex flex-wrap gap-3">
          {/* Abre o PDF servido pelo servidor (sessão Admin + RLS) — nunca uma URL pública. */}
          {documents.danfe && (
            <a
              href={`/admin/faturamento-envios/${record.id}/arquivo/danfe`}
              target="_blank"
              rel="noopener noreferrer"
              className={documentButton}
            >
              VER DANFE
            </a>
          )}
          {documents.label && (
            <a
              href={`/admin/faturamento-envios/${record.id}/arquivo/etiqueta`}
              target="_blank"
              rel="noopener noreferrer"
              className={documentButton}
            >
              VER ETIQUETA
            </a>
          )}
        </div>
      ) : (
        <p className="mb-5 rounded-xl border border-dashed border-border bg-muted p-3 text-sm text-text-muted">
          {HISTORICAL_NO_DOCUMENTS_MESSAGE}
        </p>
      )}

      <div className="mb-5">
        <CustomerWhatsappPanel recordId={record.id} display={customerWhatsapp} />
      </div>

      <div className="mb-5">
        <PostSalePanel recordId={record.id} items={postSale} />
      </div>

      <div className="mb-5">
        <UpdateSituationPanel
          action={updateDeliveryAction}
          statuses={statusesForSource(record.record_source)}
          key={`${record.delivery_status}-${record.updated_at}`}
          record={{
            id: record.id,
            delivery_status: record.delivery_status,
            expected_delivery_date: record.expected_delivery_date,
            delivered_at: record.delivered_at,
            notes: record.notes,
            carrier: record.carrier,
            shipping_service: record.shipping_service,
            tracking_code: record.tracking_code,
          }}
        />
      </div>

      <div className="flex flex-col gap-5">
        <Section title="Venda e entrega">
          <Field label="Data da venda">{record.sale_date ? formatIsoDate(record.sale_date) : ""}</Field>
          <Field label="Vendedora">{sellerName ?? UNKNOWN_SELLER_LABEL}</Field>
          <Field label="Origem da venda">{record.sales_origin ? formatOriginLabel(record.sales_origin) : ""}</Field>
          <Field label="Previsão de entrega">
            {record.expected_delivery_date ? formatIsoDate(record.expected_delivery_date) : ""}
          </Field>
          <Field label="Status">
            <span className="flex flex-wrap items-center gap-2">
              <DeliveryStatusBadge status={record.delivery_status} />
              {record.delivery_status === "DELIVERED" && record.delivered_at && (
                <span className="text-text-muted">Entregue em {formatIsoDate(record.delivered_at)}</span>
              )}
            </span>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Observações">
              {record.notes ? <span className="whitespace-pre-wrap">{record.notes}</span> : ""}
            </Field>
          </div>
        </Section>

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
          <Field label="Transportadora">
            {record.carrier ? formatCarrier(record.carrier, record.shipping_service) : record.shipping_service}
          </Field>
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
