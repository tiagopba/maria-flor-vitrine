import type { FulfillmentIndicators } from "@/lib/fulfillment/listing-indicators";

/**
 * Indicadores da listagem (Fase 4) — área de conteúdo abaixo das abas, nunca no
 * cabeçalho. Só leitura (nenhum link/filtro automático: cada card descreve o
 * número, não é um botão). Dados vêm de computeFulfillmentIndicators, já
 * deduplicados por cliente (ver listing-indicators.ts).
 */
function IndicatorCard({
  label,
  value,
  tone,
  title,
}: {
  label: string;
  value: number;
  tone: "danger" | "warning" | "info" | "success";
  title: string;
}) {
  const toneClasses: Record<typeof tone, string> = {
    danger: "border-red-200 bg-red-50 text-red-800",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    info: "border-blue-200 bg-blue-50 text-blue-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  };
  return (
    <div title={title} className={`flex min-w-[9rem] flex-1 flex-col gap-0.5 rounded-xl border px-4 py-3 ${toneClasses[tone]}`}>
      <span className="text-2xl font-semibold leading-none">{value}</span>
      <span className="text-xs font-medium">{label}</span>
    </div>
  );
}

export function IndicatorsBar({ indicators }: { indicators: FulfillmentIndicators }) {
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <IndicatorCard
        label="Entregas atrasadas"
        value={indicators.overdueDeliveries}
        tone="danger"
        title="Pedidos em trânsito com previsão de entrega já vencida."
      />
      <IndicatorCard
        label="Pós-vendas pendentes"
        value={indicators.postSalePending}
        tone="warning"
        title="Pedidos entregues com pelo menos um follow-up (envio, entrega ou avaliação) ainda em aberto."
      />
      <IndicatorCard
        label="Avaliações elegíveis"
        value={indicators.reviewsEligible}
        tone="info"
        title="Clientes que ainda podem receber um pedido de avaliação no Google (nunca já solicitada, avaliada ou recusada)."
      />
      <IndicatorCard
        label="Clientes que já avaliaram"
        value={indicators.customersReviewed}
        tone="success"
        title="Clientes que já deixaram uma avaliação confirmada."
      />
    </div>
  );
}
