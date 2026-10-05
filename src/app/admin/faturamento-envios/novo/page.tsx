import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/permissions";
import { listSellersAdmin } from "@/lib/db/sellers";
import { readDocumentsAction, saveFulfillmentRecordAction } from "./actions";
import { NewRecordFlow } from "./NewRecordFlow";

export const metadata: Metadata = { title: "Novo registro — Faturamento e Envios" };

export default async function NewFulfillmentRecordPage() {
  await requireAdmin(["admin", "master"]);
  const sellers = (await listSellersAdmin()).map((s) => ({ id: s.id, name: s.name, active: s.active }));

  return (
    <div>
      <Link href="/admin/faturamento-envios" className="text-sm text-text-muted hover:text-text">
        ← Faturamento e Envios
      </Link>
      <h1 className="mb-1 mt-2 font-display text-2xl text-text">Novo registro</h1>
      <p className="mb-6 text-sm text-text-muted">
        Envie o DANFE Simplificado e a etiqueta de envio. Os dados são lidos do próprio PDF e você confere tudo antes de
        salvar.
      </p>
      <NewRecordFlow readDocuments={readDocumentsAction} saveRecord={saveFulfillmentRecordAction} sellers={sellers} />
    </div>
  );
}
