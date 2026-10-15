import { saveTrackingAction } from "../tracking-actions";
import { TrackingForm } from "../TrackingForm";

/** Mostrado só quando `isPendingTracking` é true para o registro — ver RecordDetailView. */
export function TrackingPendingPanel({ recordId, carrier }: { recordId: string; carrier: string | null }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-5">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-900">Rastreamento pendente</h2>
        <p className="text-sm text-amber-900/80">
          Esta venda foi aprovada mas ainda não tem código de rastreamento. O pós-venda de envio só libera depois
          de salvar transportadora e código.
        </p>
      </div>
      <TrackingForm recordId={recordId} carrier={carrier} action={saveTrackingAction.bind(null, `/admin/faturamento-envios/${recordId}`)} />
    </div>
  );
}
