import { requireAdmin } from "@/lib/auth/permissions";
import { downloadFulfillmentDocument, getFulfillmentRecord, logFulfillmentAudit } from "@/lib/db/fulfillment";
import { documentPathFor } from "@/lib/fulfillment/documents";

// Entrega o PDF pelo próprio servidor, depois de checar sessão Admin/Master:
// o arquivo mora em bucket privado e nenhuma URL pública/permanente existe.
export async function GET(_request: Request, { params }: RouteContext<"/admin/faturamento-envios/[id]/arquivo/[tipo]">) {
  const admin = await requireAdmin(["admin", "master"]);

  const { id, tipo } = await params;
  if (tipo !== "danfe" && tipo !== "etiqueta") return new Response("Not found", { status: 404 });

  const record = await getFulfillmentRecord(id);
  if (!record) return new Response("Not found", { status: 404 });

  // Registro histórico não tem PDFs: responde 404 SEM consultar o Storage.
  const path = documentPathFor(record, tipo);
  if (!path) return new Response("Documento não disponível", { status: 404 });
  const bytes = await downloadFulfillmentDocument(path);
  if (!bytes) return new Response("Arquivo indisponível", { status: 404 });

  await logFulfillmentAudit({
    recordId: record.id,
    action: "DOCUMENT_VIEWED",
    actorId: admin.id,
    details: { document: tipo },
  });

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${tipo === "danfe" ? "danfe" : "etiqueta"}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}
