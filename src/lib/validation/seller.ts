import { z } from "zod";

const nameField = z
  .string()
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Informe o nome.").max(80, "Nome muito longo."));

const WHATSAPP_ERROR = "Número de WhatsApp inválido — inclua DDI e DDD.";

/**
 * Aceita formatos amigáveis no formulário (com parênteses, espaço, traço, "+")
 * e normaliza para só dígitos no formato internacional (10–15) — o banco e a
 * URL do WhatsApp sempre recebem o número já limpo. Vazio = sem número (null).
 */
function normalizeWhatsapp(raw: string): { digits: string | null; valid: boolean } {
  const digits = raw.replace(/\D/g, "");
  if (digits === "") return { digits: null, valid: true };
  return { digits, valid: digits.length >= 10 && digits.length <= 15 };
}

const phoneField = z
  .string()
  .trim()
  .max(20, "Telefone muito longo.")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

/**
 * Regra do WhatsApp (espelha o banco — sellers_active_requires_whatsapp_check):
 * vendedora ATIVA exige WhatsApp válido; INATIVA pode ficar sem número
 * (ex-funcionária cadastrada só para o histórico), mas se vier deve ser válido.
 */
function refineWhatsapp(
  value: { whatsapp_number: string; active: boolean },
  ctx: z.RefinementCtx
): void {
  const { digits, valid } = normalizeWhatsapp(value.whatsapp_number);
  if (!valid) {
    ctx.addIssue({ code: "custom", path: ["whatsapp_number"], message: WHATSAPP_ERROR });
  } else if (value.active && digits === null) {
    ctx.addIssue({
      code: "custom",
      path: ["whatsapp_number"],
      message: "Vendedora ativa precisa de WhatsApp (com DDI e DDD).",
    });
  }
}

/** NOVA VENDEDORA: cria um registro novo (novo id). Inativa pode nascer sem WhatsApp. */
export const sellerSchema = z
  .object({
    name: nameField,
    whatsapp_number: z.string(),
    phone: phoneField,
    active: z.boolean(),
    round_robin: z.boolean(),
  })
  .superRefine(refineWhatsapp)
  .transform((v) => ({ ...v, whatsapp_number: normalizeWhatsapp(v.whatsapp_number).digits }));

export type SellerInput = z.infer<typeof sellerSchema>;

/** EDITAR NOME: só o nome (correção de grafia da MESMA pessoa). */
export const sellerNameSchema = z.object({ name: nameField });

/** CONTATO — WhatsApp/telefone/rodízio; nunca nome nem situação. `active` é a situação ATUAL da vendedora. */
export function sellerContactSchemaFor(active: boolean) {
  return z
    .object({
      whatsapp_number: z.string(),
      phone: phoneField,
      round_robin: z.boolean(),
    })
    .superRefine((v, ctx) => refineWhatsapp({ whatsapp_number: v.whatsapp_number, active }, ctx))
    .transform((v) => ({ ...v, whatsapp_number: normalizeWhatsapp(v.whatsapp_number).digits }));
}

export type SellerContactInput = z.infer<ReturnType<typeof sellerContactSchemaFor>>;

/** REATIVAR uma vendedora que não tem WhatsApp: o número é obrigatório e válido (nunca inventado). */
export const sellerReactivationSchema = z.object({
  whatsapp_number: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 10 && v.length <= 15, WHATSAPP_ERROR),
});
