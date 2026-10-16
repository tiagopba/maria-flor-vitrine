import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth/permissions";
import { isUuid } from "@/lib/db/fulfillment";
import { getIntakeRow, listAttempts } from "@/lib/db/intakes";
import { formatBRL, formatIsoDate, formatStoreDateTime } from "@/lib/fulfillment/format";
import { formatCustomerWhatsapp } from "@/lib/fulfillment/phone";
import { formatPayment } from "@/lib/intake/payment";
import { CANCEL_REASON_LABELS, isCancelReason } from "@/lib/intake/cancel";
import { INTAKE_STATUS_LABELS, canCancelIntake, canReopenCollection, canUploadDocuments, type IntakeStatus } from "@/lib/intake/status";
import { isIntakeTokenExpired } from "@/lib/intake/token";
import { formatCpfCnpj, formatPostalCode } from "@/lib/fulfillment/text";
import { ReopenPanel } from "./ReopenPanel";
import { CancelIntakePanel } from "./CancelIntakePanel";
import { ConferenciaPanel, type AttemptView } from "./ConferenciaPanel";
import { NfeDataSection } from "./NfeDataSection";

/**
 * CAIXA ALTA só pra exibição/cópia (nunca grava nada — ver NfeDataSection).
 * Cobre dados antigos que foram gravados antes da normalização existir no
 * formulário público (ex.: "Tatiane Chabariberi" → "TATIANE CHABARIBERI"),
 * sem nenhum UPDATE retroativo no banco.
 */
function upper(value: string | null): string | null {
  return value ? value.toUpperCase() : value;
}

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
  const cancelled = status === "CANCELLED";
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
          {cancelled && row.cancelled_at ? ` em ${formatStoreDateTime(row.cancelled_at)}` : ""}
          {!received && !cancelled && (expired ? " · link expirado" : ` · link válido até ${formatStoreDateTime(row.token_expires_at)}`)}
        </p>
      </div>

      <section className="rounded-2xl border border-admin-border bg-white p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-text-muted">Venda</h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Data da venda" value={formatIsoDate(row.sale_date)} />
          <Field label="Valor da venda" value={formatBRL(Number(row.sale_total))} />
          <Field label="Venda STI3" value={row.sti3_sale_id} />
          <Field label="Pagamento" value={formatPayment(row.payment_method)} />
          <Field label="WhatsApp" value={formatCustomerWhatsapp(row.customer_whatsapp) ?? "Não cadastrado"} />
        </dl>
        {row.internal_notes && <p className="mt-4 rounded-xl bg-admin-surface-muted p-3 text-sm text-text">{row.internal_notes}</p>}
      </section>

      {!received ? (
        <section className="rounded-2xl border border-admin-border bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-text-muted">Dados para emissão da NF-e</h2>
          <p className="text-sm text-text-muted">Ainda não recebidos.</p>
        </section>
      ) : (
        <NfeDataSection
          fields={{
            name: upper(row.submitted_name),
            cpf: formatCpfCnpj(row.submitted_cpf) || row.submitted_cpf,
            email: row.submitted_email,
            whatsapp: formatCustomerWhatsapp(row.submitted_whatsapp),
            postalCode: formatPostalCode(row.submitted_postal_code) || row.submitted_postal_code,
            addressLine: upper(row.submitted_address_line),
            addressNumber: row.submitted_address_number,
            addressComplement: upper(row.submitted_address_complement),
            neighborhood: upper(row.submitted_neighborhood),
            city: upper(row.submitted_city),
            state: upper(row.submitted_state),
            recipientName: row.submitted_delivery_to_customer ? null : upper(row.submitted_recipient_name),
          }}
        />
      )}

      {received && !cancelled && (
        <section className="rounded-2xl border border-admin-border bg-white p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-text-muted">CONFERÊNCIA — XML DA NF-e</h2>
          <p className="mb-4 mt-1 text-xs text-text-muted">Dados conferidos com o XML autorizado da NF-e.</p>
          <ConferenciaPanel intakeId={row.id} attempts={attempts} canUpload={canUploadDocuments(status)} />
        </section>
      )}

      <section className="rounded-2xl border border-admin-border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Link para a cliente</h2>
        {cancelled ? (
          <p className="text-sm text-text-muted">Venda cancelada: o link foi invalidado e não pode ser reaberto.</p>
        ) : canReopenCollection(status) ? (
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

      <section className="rounded-2xl border border-admin-border bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">Cancelamento</h2>
        {cancelled ? (
          <dl className="grid gap-4 sm:grid-cols-2">
            <Field label="Motivo" value={isCancelReason(row.cancel_reason) ? CANCEL_REASON_LABELS[row.cancel_reason] : "Não informado"} />
            <Field label="Cancelada em" value={formatStoreDateTime(row.cancelled_at)} />
          </dl>
        ) : canCancelIntake(status, row.approved_record_id) ? (
          <CancelIntakePanel intakeId={row.id} />
        ) : (
          <p className="text-sm text-text-muted">Venda já aprovada: o cancelamento segue pelo fluxo do fulfillment.</p>
        )}
      </section>
    </div>
  );
}
