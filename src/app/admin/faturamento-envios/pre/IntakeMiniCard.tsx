import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { formatBRL, formatIsoDate, formatStoreDateTime } from "@/lib/fulfillment/format";
import { CANCEL_REASON_LABELS, isCancelReason } from "@/lib/intake/cancel";
import { INTAKE_STATUS_LABELS, type IntakeStatus } from "@/lib/intake/status";
import { isIntakeTokenExpired } from "@/lib/intake/token";
import type { IntakeSectionPresentation } from "./intake-section-presentation";

export interface IntakeMiniCardRow {
  id: string;
  customer_name: string;
  sale_date: string;
  sale_total: number | string;
  status: string;
  submitted_at: string | null;
  token_expires_at: string;
  sti3_sale_id: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
}

/**
 * Card de uma venda dentro de uma seção do Pré-faturamento. Só
 * apresentação — nenhuma regra nova: `INTAKE_STATUS_LABELS`,
 * `CANCEL_REASON_LABELS` e `isIntakeTokenExpired` já existiam e já eram
 * usados (na página de detalhe); este card só organiza o mesmo texto em
 * hierarquia visual, e passa a mostrar sempre o STI3 (antes só aparecia
 * nas canceladas, apesar do dado já vir do banco).
 */
export function IntakeMiniCard({ row, presentation }: { row: IntakeMiniCardRow; presentation: IntakeSectionPresentation }) {
  const status = row.status as IntakeStatus;
  const cancelled = status === "CANCELLED";

  const secondaryParts = [
    row.sti3_sale_id ? `STI3 ${row.sti3_sale_id}` : null,
    `venda ${formatIsoDate(row.sale_date)}`,
    formatBRL(Number(row.sale_total)),
  ].filter(Boolean);

  let footerText: string;
  if (cancelled) {
    const reason = isCancelReason(row.cancel_reason) ? CANCEL_REASON_LABELS[row.cancel_reason] : "Motivo não informado";
    footerText = `${reason} · cancelada em ${formatStoreDateTime(row.cancelled_at)}`;
  } else if (row.submitted_at) {
    footerText = `Recebido em ${formatStoreDateTime(row.submitted_at)}`;
  } else {
    footerText = isIntakeTokenExpired(row.token_expires_at)
      ? "Link expirado"
      : `Link válido até ${formatStoreDateTime(row.token_expires_at)}`;
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-xl border border-admin-border bg-white p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-text">{row.customer_name}</span>
        <Badge tone={presentation.badgeTone} className="shrink-0">
          {INTAKE_STATUS_LABELS[status]}
        </Badge>
      </div>

      <p className="text-sm text-text-muted">{secondaryParts.join(" · ")}</p>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-text-muted">{footerText}</span>
        <Link
          href={`/admin/faturamento-envios/pre/${row.id}`}
          className={buttonClasses({ variant: "ghost", size: "md", className: "shrink-0 border border-admin-border px-4 text-xs" })}
        >
          Ver detalhes
        </Link>
      </div>
    </div>
  );
}
