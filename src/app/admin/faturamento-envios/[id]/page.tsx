import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SuccessToast } from "@/components/admin/SuccessToast";
import { requireAdmin } from "@/lib/auth/permissions";
import { getFulfillmentRecord, getSellerName } from "@/lib/db/fulfillment";
import { listFollowups, listPostSaleEvents } from "@/lib/db/post-sale";
import {
  FOLLOWUP_TYPE_BY_KIND,
  POST_SALE_ACTIONS,
  POST_SALE_KINDS,
  buildDeliveryConfirmationMessage,
  buildGoogleReviewMessage,
  buildShippingNoticeMessage,
  derivePostSaleState,
  postSaleAvailability,
  whatsappUrl,
  type FollowupRow,
  type PostSaleKind,
} from "@/lib/fulfillment/post-sale";
import { customerFirstName } from "@/lib/fulfillment/greeting";
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

  const [events, followups] = await Promise.all([listPostSaleEvents(id), listFollowups(id)]);
  const availability = postSaleAvailability({
    deliveryStatus: record.delivery_status,
    carrier: record.carrier,
    trackingCode: record.tracking_code,
  });
  const messages: Record<PostSaleKind, string | null> = {
    tracking: buildShippingNoticeMessage({
      customerName: record.customer_name,
      carrier: record.carrier,
      service: record.shipping_service,
      trackingCode: record.tracking_code,
    }),
    delivery: buildDeliveryConfirmationMessage(record.customer_name),
    review: buildGoogleReviewMessage(record.customer_name),
  };
  const firstName = customerFirstName(record.customer_name);
  const emptyFollowup = (kind: PostSaleKind): FollowupRow => ({
    type: FOLLOWUP_TYPE_BY_KIND[kind],
    status: "OPEN",
    sent_at: null,
    sent_by_name: null,
    message_snapshot: null,
  });
  const postSale = POST_SALE_KINDS.map((kind) => {
    const message = messages[kind];
    const followup = followups.find((f) => f.type === FOLLOWUP_TYPE_BY_KIND[kind]) ?? emptyFollowup(kind);
    const openedEvents = events.filter((e) => e.action === POST_SALE_ACTIONS[kind].opened);
    const state = derivePostSaleState(followup, openedEvents);
    // Enviado: reabrir o WhatsApp usa o texto EXATO confirmado, nunca o modelo atual
    // (que pode ter mudado desde então). Sem snapshot (confirmação antiga), cai no modelo atual.
    const messageForLink = state.status === "SENT" ? (state.messageSnapshot ?? message) : message;
    return {
      kind,
      message,
      customerFirstName: firstName,
      url: messageForLink ? whatsappUrl(customerPhone, messageForLink) : null,
      availability: availability[kind],
      state,
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
