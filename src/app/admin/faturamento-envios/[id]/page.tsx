import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SuccessToast } from "@/components/admin/SuccessToast";
import { requireAdmin } from "@/lib/auth/permissions";
import { getFulfillmentRecord, getSellerName } from "@/lib/db/fulfillment";
import { listPostSaleEvents } from "@/lib/db/post-sale";
import {
  POST_SALE_KINDS,
  buildDeliveryConfirmationMessage,
  buildGoogleReviewMessage,
  buildTrackingMessage,
  derivePostSaleState,
  postSaleAvailability,
  whatsappUrl,
  type PostSaleKind,
} from "@/lib/fulfillment/post-sale";
import { formatCustomerWhatsapp } from "@/lib/fulfillment/phone";
import { RecordDetailView } from "./RecordDetailView";

export const metadata: Metadata = { title: "Detalhes do registro — Faturamento e Envios" };

export default async function FulfillmentDetailPage({ params }: PageProps<"/admin/faturamento-envios/[id]">) {
  await requireAdmin(["admin", "master"]);

  const { id } = await params;
  const record = await getFulfillmentRecord(id);
  if (!record) notFound();
  const sellerName = await getSellerName(record.seller_id);

  // WhatsApp do cliente: NULL nos registros atuais. Sem ele, o link fica vazio e a tela oferece só copiar.
  const customerPhone: string | null = record.customer_whatsapp ?? null;

  const events = await listPostSaleEvents(id);
  const availability = postSaleAvailability({
    deliveryStatus: record.delivery_status,
    carrier: record.carrier,
    trackingCode: record.tracking_code,
  });
  const messages: Record<PostSaleKind, string | null> = {
    tracking: buildTrackingMessage({
      customerName: record.customer_name,
      carrier: record.carrier,
      service: record.shipping_service,
      trackingCode: record.tracking_code,
    }),
    delivery: buildDeliveryConfirmationMessage(record.customer_name),
    review: buildGoogleReviewMessage(record.customer_name),
  };
  const postSale = POST_SALE_KINDS.map((kind) => {
    const message = messages[kind];
    return {
      kind,
      message,
      url: message ? whatsappUrl(customerPhone, message) : null,
      availability: availability[kind],
      state: derivePostSaleState(events, kind),
    };
  });

  return (
    <>
      <SuccessToast />
      <RecordDetailView
        record={record}
        sellerName={sellerName}
        postSale={postSale}
        customerWhatsapp={formatCustomerWhatsapp(customerPhone)}
      />
    </>
  );
}
