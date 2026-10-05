import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/db/fulfillment";
import { getIntakeRow, listAttempts } from "@/lib/db/intakes";
import { formatBRL, formatIsoDate, formatStoreDateTime } from "@/lib/fulfillment/format";
import { formatCustomerWhatsapp } from "@/lib/fulfillment/phone";
import { formatPayment, type PaymentMethod } from "@/lib/intake/payment";
import { INTAKE_STATUS_LABELS, canReopenCollection, canUploadDocuments, type IntakeStatus } from "@/lib/intake/status";
import { isIntakeTokenExpired } from "@/lib/intake/token";
import { formatCpfCnpj, formatPostalCode } from "@/lib/fulfillment/text";
import { ReopenPanel } from "./ReopenPanel";
import { ConferenciaPanel, type AttemptView } from "./ConferenciaPanel";

export const metadata: Metadata = { title: "Solicitação de pré-faturamento — Faturamento e Envios" };

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs uppercase tracking-wide text-text-muted">{label}</dt>
      <dd className="break-words text-sm text-text">{value || "—"}</dd>
    </div>
  );
}

export default async function PreFaturamentoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(["admin", "master"]);
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const row = await getIntakeRow(id);
  if (!row) notFound();

  const status = row.status as IntakeStatus;
  const expired = isIntakeTokenExpired(row.token_expires_at);
  const received = status !== "AWAITING_CUSTOMER_DATA";
  const attempts: AttemptView[] = received
    ? (await listAttempts(row.id)).map((a) => {
        const c = (a.comparison ?? {}) as { results?: AttemptView["results"]; extracted?: AttemptView["extracted"] };
        return {
          id: a.id,
          attemptNo: a.attempt_no,
          verdict: a.verdict,
          blockingFields: a.blocking_fields,
          reviewFields: a.review_fields,
          reviewedFields: a.reviewed_fields,
          createdAt: a.created_at,
          results: c.results ?? [],
          extracted: c.extracted ?? {},
        };
      })
    : [];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <Link href="/admin/faturamento-envios/pre" className="text-sm text-text-muted hover:text-text">
        ← Pré-faturamento
      </Link>
      <div>
        <h1 className="font-display text-2xl text-text">{row.customer_name}</h1>
        <p className="text-sm text-text-muted">
          {INTAKE_STATUS_LABELS[status]}
          {!received && (expired ? " · link expirado" : ` · link válido até ${formatStoreDateTime(row.token_expires_at)}`)}
        </p>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">Venda</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Data da venda" value={formatIsoDate(row.sale_date)} />
          <Field label="Valor da venda" value={formatBRL(Number(row.sale_total))} />
          <Field label="Pagamento" value={formatPayment(row.payment_method as PaymentMethod, row.installments)} />
          <Field label="WhatsApp" value={formatCustomerWhatsapp(row.customer_whatsapp) ?? "Não cadastrado"} />
        </dl>
        {row.internal_notes && <p className="mt-4 rounded-xl bg-muted p-3 text-sm text-text">{row.internal_notes}</p>}
      </section>

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-text-muted">Dados recebidos da cliente</h2>
        {!received ? (
          <p className="text-sm text-text-muted">Ainda não recebidos.</p>
        ) : (
          <>
            <p className="mb-4 text-xs text-text-muted">Recebidos em {formatStoreDateTime(row.submitted_at)}. Dados pessoais: só Admin/Master.</p>
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Nome completo" value={row.submitted_name} />
              <Field label="CPF" value={formatCpfCnpj(row.submitted_cpf)} />
              <Field label="E-mail" value={row.submitted_email} />
              <Field label="WhatsApp" value={formatCustomerWhatsapp(row.submitted_whatsapp)} />
              <Field label="Entrega para" value={row.submitted_delivery_to_customer ? "A própria cliente" : row.submitted_recipient_name} />
              <Field label="CEP" value={formatPostalCode(row.submitted_postal_code)} />
              <Field label="Rua" value={row.submitted_address_line} />
              <Field label="Número" value={row.submitted_address_number} />
              <Field label="Complemento" value={row.submitted_address_complement} />
              <Field label="Bairro" value={row.submitted_neighborhood} />
              <Field label="Cidade / UF" value={row.submitted_city && row.submitted_state ? `${row.submitted_city} / ${row.submitted_state}` : null} />
            </dl>
          </>
        )}
      </section>

      {received && (
        <section className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">Conferência (DANFE + etiqueta)</h2>
          <ConferenciaPanel intakeId={row.id} attempts={attempts} canUpload={canUploadDocuments(status)} />
        </section>
      )}

      <section className="rounded-2xl border border-border bg-surface p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Link para a cliente</h2>
        {canReopenCollection(status) ? (
          <ReopenPanel
            intakeId={row.id}
            customerName={row.customer_name}
            customerWhatsapp={row.customer_whatsapp}
            canReopen={canReopenCollection(status)}
          />
        ) : (
          <p className="text-sm text-text-muted">Solicitação aprovada: o link não pode mais ser reaberto.</p>
        )}
      </section>
    </div>
  );
}
