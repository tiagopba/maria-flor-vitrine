import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SuccessToast } from "@/components/admin/SuccessToast";
import { requireAdmin } from "@/lib/auth/permissions";
import { getFulfillmentRecord } from "@/lib/db/fulfillment";
import { RecordDetailView } from "./RecordDetailView";

export const metadata: Metadata = { title: "Detalhes do registro — Faturamento e Envios" };

export default async function FulfillmentDetailPage({ params }: PageProps<"/admin/faturamento-envios/[id]">) {
  await requireAdmin(["admin", "master"]);

  const { id } = await params;
  const record = await getFulfillmentRecord(id);
  if (!record) notFound();

  return (
    <>
      <SuccessToast />
      <RecordDetailView record={record} />
    </>
  );
}
