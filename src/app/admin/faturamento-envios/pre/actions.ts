"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/permissions";
import { getSiteUrl } from "@/lib/site";
import { insertIntakeAudit, getIntakeRow, reopenIntake, createIntakeRow } from "@/lib/db/intakes";
import { isUuid } from "@/lib/db/fulfillment";
import { adminIntakeSchema } from "@/lib/intake/schema";
import { canReopenCollection } from "@/lib/intake/status";
import { generateIntakeToken, hashIntakeToken, intakeExpiresAt, intakePath } from "@/lib/intake/token";
import { intakeWhatsappUrl } from "@/lib/intake/messages";

export type IntakeActionResult = { ok: true; id: string; link: string; whatsappUrl: string | null } | { ok: false; error: string; fieldErrors?: Record<string, string> };

/** Link completo para a cliente. Só o admin que gerou vê; o token nunca vai para log. */
function fullLink(token: string): string {
  return `${getSiteUrl().replace(/\/$/, "")}${intakePath(token)}`;
}

/** SOLICITAR DADOS DO CLIENTE: cria a solicitação e gera o link (7 dias). Só Admin/Master. */
export async function createIntakeAction(raw: Record<string, string>): Promise<IntakeActionResult> {
  const admin = await requireAdmin(["admin", "master"]);

  const parsed = adminIntakeSchema.safeParse({
    customerName: raw.customerName ?? "",
    customerWhatsapp: raw.customerWhatsapp ?? "",
    sellerId: raw.sellerId ?? "",
    saleDate: raw.saleDate ?? "",
    saleTotal: raw.saleTotal ?? "",
    paymentMethod: raw.paymentMethod ?? "",
    installments: raw.installments ?? "",
    internalNotes: raw.internalNotes ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, error: "Corrija os campos destacados.", fieldErrors };
  }
  if (parsed.data.sellerId && !isUuid(parsed.data.sellerId)) return { ok: false, error: "Vendedora inválida." };

  const token = generateIntakeToken();
  const expiresAt = intakeExpiresAt();
  try {
    const { id } = await createIntakeRow({
      sellerId: parsed.data.sellerId,
      saleDate: parsed.data.saleDate,
      customerName: parsed.data.customerName,
      customerWhatsapp: parsed.data.customerWhatsapp,
      saleTotal: parsed.data.saleTotal,
      paymentMethod: parsed.data.paymentMethod,
      installments: parsed.data.installments,
      internalNotes: parsed.data.internalNotes,
      tokenHash: hashIntakeToken(token),
      expiresAt: expiresAt.toISOString(),
      createdBy: admin.id,
    });
    await insertIntakeAudit({ intakeId: id, action: "INTAKE_CREATED", actorId: admin.id });
    revalidatePath("/admin/faturamento-envios/pre");
    const link = fullLink(token);
    return { ok: true, id, link, whatsappUrl: intakeWhatsappUrl(parsed.data.customerWhatsapp, parsed.data.customerName, link) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Não foi possível criar a solicitação." };
  }
}

/**
 * REABRIR COLETA: invalida o token anterior, gera um novo (7 dias) e zera o envio.
 * Não permitido depois de aprovada. O token antigo nunca é reutilizado.
 */
export async function reopenIntakeAction(id: string): Promise<IntakeActionResult> {
  const admin = await requireAdmin(["admin", "master"]);
  if (!isUuid(id)) return { ok: false, error: "Solicitação inválida." };

  const row = await getIntakeRow(id);
  if (!row) return { ok: false, error: "Solicitação não encontrada." };
  if (!canReopenCollection(row.status)) return { ok: false, error: "Esta solicitação já foi aprovada e não pode ser reaberta." };

  const token = generateIntakeToken();
  const expiresAt = intakeExpiresAt();
  await reopenIntake({ id, tokenHash: hashIntakeToken(token), expiresAt: expiresAt.toISOString() });
  await insertIntakeAudit({ intakeId: id, action: "INTAKE_LINK_REOPENED", actorId: admin.id });
  revalidatePath(`/admin/faturamento-envios/pre/${id}`);
  const link = fullLink(token);
  return { ok: true, id, link, whatsappUrl: intakeWhatsappUrl(row.customer_whatsapp, row.customer_name, link) };
}
