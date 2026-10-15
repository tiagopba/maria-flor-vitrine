import { formatIsoDate } from "@/lib/fulfillment/format";
import { saveTrackingAction } from "../../tracking-actions";
import { TrackingForm } from "../../TrackingForm";
import type { PendingTrackingRecord } from "@/lib/db/fulfillment";

/**
 * Bloqueia Nova Venda enquanto existir venda aprovada sem rastreamento — tanto pelo
 * botão quanto pelo acesso direto à rota (page.tsx renderiza isto em vez do formulário).
 */
export function PendingTrackingBlock({ records }: { records: PendingTrackingRecord[] }) {
  const action = saveTrackingAction.bind(null, "/admin/faturamento-envios/pre/nova");
  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-text">Rastreamento pendente</h1>
        <p className="text-sm text-text-muted">
          Antes de iniciar uma nova venda, informe o código de rastreamento da venda anterior.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        {records.map((record) => (
          <div key={record.id} className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-5">
            <div className="text-sm text-amber-900">
              <div className="font-medium">{record.customer_name}</div>
              <div className="text-amber-900/80">
                {record.sti3_sale_id ? `STI3 ${record.sti3_sale_id} · ` : ""}
                venda {formatIsoDate(record.sale_date)}
                {record.carrier ? ` · ${record.carrier}` : ""}
              </div>
            </div>
            <TrackingForm recordId={record.id} carrier={record.carrier} action={action} />
          </div>
        ))}
      </div>
    </div>
  );
}
