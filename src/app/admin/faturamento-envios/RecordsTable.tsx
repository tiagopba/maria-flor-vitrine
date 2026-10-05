import Link from "next/link";
import { Badge } from "@/components/ui/Badge";
import type { FulfillmentListItem } from "@/lib/db/fulfillment";
import { DELIVERY_STATUS_LABELS, describeSellerOrigin, type DeliveryStatus } from "@/lib/fulfillment/delivery";
import { formatCarrier, formatIsoDate } from "@/lib/fulfillment/format";
import { maskCpfCnpj } from "@/lib/fulfillment/text";

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
    <Badge tone={tone} className={className}>
      {DELIVERY_STATUS_LABELS[status]}
    </Badge>
  );
}

export function RecordsTable({
  records,
  sellerNames,
}: {
  records: FulfillmentListItem[];
  /** id da vendedora → nome (só as vendedoras cadastradas em public.sellers). */
  sellerNames: Record<string, string>;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[64rem] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
            <th className="px-4 py-3 font-medium">Venda</th>
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Vendedora/Origem</th>
            <th className="px-4 py-3 font-medium">Transportadora/Serviço</th>
            <th className="px-4 py-3 font-medium">Rastreio</th>
            <th className="px-4 py-3 font-medium">Previsão</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {records.map((record) => {
            const sellerName = record.seller_id ? (sellerNames[record.seller_id] ?? null) : null;
            const sellerOrigin = describeSellerOrigin(sellerName, record.sales_origin);
            return (
              <tr key={record.id} className="border-b border-border/60 align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-3 text-text">{formatIsoDate(record.sale_date)}</td>
                <td className="px-4 py-3">
                  <div className="font-medium text-text">
                    {record.customer_name}
                    {record.record_source === "HISTORICAL_IMPORT" && (
                      <span className="ml-2 rounded border border-border px-1.5 py-0.5 align-middle text-[10px] font-medium uppercase tracking-wide text-text-muted">
                        Histórico
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-text-muted">
                    <span className="font-mono">{maskCpfCnpj(record.customer_cpf)}</span>
                    {record.nfe_number && <> · NF-e {record.nfe_number}</>}
                  </div>
                </td>
                <td className="px-4 py-3 text-text">
                  <div>{sellerOrigin.primary}</div>
                  {sellerOrigin.secondary && <div className="mt-0.5 text-xs text-text-muted">{sellerOrigin.secondary}</div>}
                </td>
                <td className="px-4 py-3 text-text">{formatCarrier(record.carrier, record.shipping_service)}</td>
                <td className="px-4 py-3 font-mono text-text">{record.tracking_code ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-3 text-text-muted">
                  {formatIsoDate(record.expected_delivery_date)}
                </td>
                <td className="px-4 py-3">
                  <DeliveryStatusBadge status={record.delivery_status} />
                  {record.delivery_status === "DELIVERED" && record.delivered_at && (
                    <div className="mt-1 whitespace-nowrap text-xs text-text-muted">
                      Entregue em {formatIsoDate(record.delivered_at)}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/admin/faturamento-envios/${record.id}`}
                    className="whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-muted"
                  >
                    VER DETALHES
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
