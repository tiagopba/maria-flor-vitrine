import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { FulfillmentListItem } from "@/lib/db/fulfillment";
import { DELIVERY_STATUS_LABELS, describeSellerOrigin, isPendingTracking, statusesForSource, type DeliveryStatus } from "@/lib/fulfillment/delivery";
import { displayGroupFor, todayIsoInStoreTimeZone } from "@/lib/fulfillment/delivery-priority";
import { formatCarrier, formatIsoDate } from "@/lib/fulfillment/format";
import { maskCpfCnpj } from "@/lib/fulfillment/text";
import { QuickEditModal } from "./QuickEditModal";
import type { QuickUpdateDeliveryResult } from "./quick-edit-actions";

const STATUS_BADGE: Record<DeliveryStatus, { tone: "neutral" | "primary" | "warning" | "success"; className?: string }> = {
  PENDING: { tone: "neutral" },
  IN_TRANSIT: { tone: "primary" },
  DELIVERED: { tone: "success" },
  RESENT: { tone: "warning" },
  REFUNDED: { tone: "neutral" },
  DELIVERY_ISSUE: { tone: "warning", className: "bg-red-50 text-red-700" },
  // Sem fundo de destaque: "Situação não informada" é ausência de dado, não um alerta.
  UNKNOWN: { tone: "neutral", className: "bg-transparent text-text-muted ring-1 ring-border" },
};

export function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  const { tone, className } = STATUS_BADGE[status];
  return (
    <Badge tone={tone} className={`whitespace-nowrap ${className ?? ""}`}>
      {DELIVERY_STATUS_LABELS[status]}
    </Badge>
  );
}

/**
 * EM_ATRASO é calculado (ver delivery-priority.ts), nunca um delivery_status
 * — por isso é uma badge própria, mostrada JUNTO da badge de status real
 * (IN_TRANSIT), não no lugar dela. Vermelho mais forte que DELIVERY_ISSUE
 * (bg-red-50) pra ficar claramente mais destacada, como pedido.
 */
function OverdueBadge() {
  return <Badge tone="danger" className="whitespace-nowrap bg-red-100 font-semibold text-red-800">⏰ Entrega atrasada</Badge>;
}

/**
 * Grupo POST_SALE_PENDING (DELIVERED com follow-up OPEN — nunca escondido
 * pelo toggle "Mostrar entregues concluídas"): mostrado JUNTO do badge verde
 * "Entregue" (DeliveryStatusBadge), nunca no lugar dele.
 */
function PostSalePendingBadge({ openCount }: { openCount: number }) {
  return (
    <Badge tone="warning" className="whitespace-nowrap bg-amber-100 font-semibold text-amber-900">
      ● {openCount} follow-up{openCount === 1 ? "" : "s"} em aberto
    </Badge>
  );
}

function FollowupBadge({ openCount }: { openCount: number | undefined }) {
  // undefined = tabela de follow-ups ainda não existe neste banco (migration não aplicada).
  if (openCount === undefined) return <span className="text-xs text-text-muted">—</span>;
  return openCount === 0 ? (
    <Badge tone="success" className="whitespace-nowrap">✓ Concluídos</Badge>
  ) : (
    <Badge tone="warning" className="whitespace-nowrap">● {openCount} em aberto</Badge>
  );
}

export function RecordsTable({
  records,
  sellerNames,
  followupOpenCounts,
  quickUpdateAction,
}: {
  records: FulfillmentListItem[];
  /** id da vendedora → nome (só as vendedoras cadastradas em public.sellers). */
  sellerNames: Record<string, string>;
  /** id do registro → quantos follow-ups ainda estão OPEN (0 = os 3 enviados). `null` = migration ainda não aplicada. */
  followupOpenCounts: Record<string, number> | null;
  /** Edição rápida por linha — já com `returnTo` (a própria listagem) curried. */
  quickUpdateAction: (id: string, formData: FormData) => Promise<QuickUpdateDeliveryResult>;
}) {
  const todayIso = todayIsoInStoreTimeZone();
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[64rem] text-left text-sm">
        <thead>
          <tr className="border-b border-border bg-admin-surface-muted text-xs uppercase tracking-wide text-text-muted">
            <th className="px-4 py-3 font-medium">Venda</th>
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Vendedora/Origem</th>
            <th className="px-4 py-3 font-medium">Transporte</th>
            <th className="px-4 py-3 font-medium">Rastreio</th>
            <th className="px-4 py-3 font-medium">Previsão</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Follow-ups</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const sellerName = record.seller_id ? (sellerNames[record.seller_id] ?? null) : null;
            const sellerOrigin = describeSellerOrigin(sellerName, record.sales_origin);
            const group = displayGroupFor(record, todayIso);
            const isOverdue = group === "EM_ATRASO";
            const isPostSalePending = group === "POST_SALE_PENDING";
            return (
              <tr key={record.id} className="border-b border-border/60 align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-2 text-text">{formatIsoDate(record.sale_date)}</td>
                <td className="px-4 py-2">
                  <div className="font-medium text-text">
                    {record.customer_name}
                    {record.record_source === "HISTORICAL_IMPORT" && (
                      <span className="ml-2 whitespace-nowrap rounded border border-border px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-text-muted">
                        Histórico
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    <span className="font-mono">{maskCpfCnpj(record.customer_cpf)}</span>
                    {record.nfe_number && <> · NF-e {record.nfe_number}</>}
                  </div>
                </td>
                <td className="px-4 py-2 text-text">
                  <div>{sellerOrigin.primary}</div>
                  {sellerOrigin.secondary && <div className="text-xs text-text-muted">{sellerOrigin.secondary}</div>}
                </td>
                <td className="px-4 py-2 text-text">{formatCarrier(record.carrier, record.shipping_service)}</td>
                <td className="px-4 py-2 font-mono text-text">{record.tracking_code ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-text-muted">
                  {formatIsoDate(record.expected_delivery_date)}
                </td>
                <td className="px-4 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <DeliveryStatusBadge status={record.delivery_status} />
                    {isOverdue && <OverdueBadge />}
                    {isPostSalePending && <PostSalePendingBadge openCount={followupOpenCounts?.[record.id] ?? 0} />}
                  </div>
                  {record.delivery_status === "DELIVERED" && record.delivered_at && (
                    <div className="mt-0.5 whitespace-nowrap text-xs text-text-muted">
                      Entregue em {formatIsoDate(record.delivered_at)}
                    </div>
                  )}
                  {isPendingTracking(record.tracking_code, record.delivery_status) && (
                    <div className="mt-0.5">
                      <Badge tone="warning" className="whitespace-nowrap bg-amber-50 text-amber-800">
                        RASTREAMENTO PENDENTE
                      </Badge>
                    </div>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2">
                  <FollowupBadge openCount={followupOpenCounts === null ? undefined : followupOpenCounts[record.id] ?? 0} />
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex flex-wrap items-center justify-end gap-2 sm:flex-nowrap">
                    <QuickEditModal
                      record={record}
                      statuses={statusesForSource(record.record_source)}
                      action={quickUpdateAction}
                    />
                    <Link
                      href={`/admin/faturamento-envios/${record.id}`}
                      className="whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-muted"
                    >
                      VER DETALHES
                    </Link>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
