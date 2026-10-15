import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/permissions";
import { listPendingTrackingRecords } from "@/lib/db/fulfillment";
import { listSellersAdmin } from "@/lib/db/sellers";
import { selectableSellers } from "@/lib/sellers/management";
import { NovaIntakeForm } from "./NovaIntakeForm";
import { PendingTrackingBlock } from "./PendingTrackingBlock";

export const metadata: Metadata = { title: "Solicitar dados do cliente — Faturamento e Envios" };

export default async function NovaIntakePage() {
  await requireAdmin(["admin", "master"]);

  // Bloqueia tanto o botão quanto o acesso direto a esta rota.
  const pending = await listPendingTrackingRecords();
  if (pending.length > 0) return <PendingTrackingBlock records={pending} />;

  const sellers = selectableSellers(await listSellersAdmin()).map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl text-text">Solicitar dados do cliente</h1>
        <p className="text-sm text-text-muted">
          Gera um link seguro para a cliente preencher nome, CPF, endereço e WhatsApp. Válido por 7 dias.
        </p>
      </div>
      <NovaIntakeForm sellers={sellers} />
    </div>
  );
}
