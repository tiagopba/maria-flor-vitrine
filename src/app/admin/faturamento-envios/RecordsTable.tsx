import Link from "next/link";
import type { FulfillmentListItem } from "@/lib/db/fulfillment";
import { formatBRL, formatCarrier, formatStoreDate } from "@/lib/fulfillment/format";
import { maskCpfCnpj } from "@/lib/fulfillment/text";

export function RecordsTable({ records }: { records: FulfillmentListItem[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface">
      <table className="w-full min-w-[56rem] text-left text-sm">
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-text-muted">
            <th className="px-4 py-3 font-medium">Nome</th>
            <th className="px-4 py-3 font-medium">CPF</th>
            <th className="px-4 py-3 font-medium">NF-e</th>
            <th className="px-4 py-3 font-medium">Valor</th>
            <th className="px-4 py-3 font-medium">Transportadora</th>
            <th className="px-4 py-3 font-medium">Rastreio</th>
            <th className="px-4 py-3 font-medium">Data</th>
            <th className="px-4 py-3" />
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.id} className="border-b border-border/60 last:border-0">
              <td className="px-4 py-3 font-medium text-text">{record.customer_name}</td>
              <td className="px-4 py-3 font-mono text-text-muted">{maskCpfCnpj(record.customer_cpf)}</td>
              <td className="px-4 py-3 text-text">{record.nfe_number ?? "—"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-text">{formatBRL(record.invoice_total)}</td>
              <td className="px-4 py-3 text-text">{formatCarrier(record.carrier, record.shipping_service)}</td>
              <td className="px-4 py-3 font-mono text-text">{record.tracking_code ?? "—"}</td>
              <td className="whitespace-nowrap px-4 py-3 text-text-muted">{formatStoreDate(record.created_at)}</td>
              <td className="px-4 py-3 text-right">
                <Link
                  href={`/admin/faturamento-envios/${record.id}`}
                  className="whitespace-nowrap rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-text hover:bg-muted"
                >
                  VER DETALHES
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>

  );
}
