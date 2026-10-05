"use server";

import { findIntakeByTokenHash, insertIntakeAuditSystem, submitIntakeData } from "@/lib/db/intakes";
import { canCustomerSubmit } from "@/lib/intake/status";
import { publicSubmitSchema } from "@/lib/intake/schema";
import { hashIntakeToken, isIntakeTokenExpired } from "@/lib/intake/token";

export type PublicSubmitResult =
  | { ok: true }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export interface PublicSubmitValues {
  fullName: string;
  cpf: string;
  email: string;
  whatsapp: string;
  deliveryToCustomer: boolean;
  recipientName: string;
  postalCode: string;
  addressLine: string;
  addressNumber: string;
  addressComplement: string;
  neighborhood: string;
  city: string;
  state: string;
}

/**
 * Envio dos dados pela cliente. Sem login: quem tem o token (e só enquanto ele vale)
 * envia UMA vez. Nenhum dado vai para analytics, Pixel/CAPI ou log: só o banco privado.
 */
export async function submitPublicIntakeAction(token: string, values: PublicSubmitValues): Promise<PublicSubmitResult> {
  if (typeof token !== "string" || token.length < 20 || token.length > 100) {
    return { ok: false, error: "Este link não é válido." };
  }
  const tokenHash = hashIntakeToken(token);
  const row = await findIntakeByTokenHash(tokenHash);
  if (!row) return { ok: false, error: "Este link não é válido." };
  if (isIntakeTokenExpired(row.token_expires_at)) {
    return { ok: false, error: "Este link expirou. Entre em contato com a Maria Flor para receber um novo." };
  }
  if (!canCustomerSubmit(row.status, false)) {
    return { ok: false, error: "Seus dados já foram recebidos. Se precisar corrigir algo, fale com a Maria Flor." };
  }

  const parsed = publicSubmitSchema.safeParse(values);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) fieldErrors[String(issue.path[0] ?? "form")] ??= issue.message;
    return { ok: false, error: "Confira os campos destacados.", fieldErrors };
  }
  const d = parsed.data;

  const saved = await submitIntakeData(row.id, tokenHash, {
    submitted_name: d.fullName,
    submitted_cpf: d.cpf,
    submitted_email: d.email,
    submitted_whatsapp: d.whatsapp,
    submitted_delivery_to_customer: d.deliveryToCustomer,
    submitted_recipient_name: d.deliveryToCustomer ? null : d.recipientName,
    submitted_postal_code: d.postalCode,
    submitted_address_line: d.addressLine,
    submitted_address_number: d.addressNumber,
    submitted_address_complement: d.addressComplement,
    submitted_neighborhood: d.neighborhood,
    submitted_city: d.city,
    submitted_state: d.state,
  });
  if (!saved) {
    return { ok: false, error: "Seus dados já foram recebidos. Se precisar corrigir algo, fale com a Maria Flor." };
  }

  // Evento SEM PII: só o fato de ter sido recebido.
  await insertIntakeAuditSystem(row.id, "INTAKE_DATA_RECEIVED");
  return { ok: true };
}
