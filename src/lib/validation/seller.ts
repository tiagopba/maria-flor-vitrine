import { z } from "zod";

const nameField = z
  .string()
  .transform((v) => v.replace(/\s+/g, " ").trim())
  .pipe(z.string().min(1, "Informe o nome.").max(80, "Nome muito longo."));

// Aceita formatos amigáveis no formulário (com parênteses, espaço, traço,
// "+") e normaliza para só dígitos no formato internacional aqui — o
// banco e a URL do wa.me sempre recebem o número já limpo.
const whatsappField = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length >= 10 && v.length <= 15, "Número de WhatsApp inválido — inclua DDI e DDD.");

const phoneField = z
  .string()
  .trim()
  .max(20, "Telefone muito longo.")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null));

/** NOVA VENDEDORA: cria um registro novo (novo id). */
export const sellerSchema = z.object({
  name: nameField,
  whatsapp_number: whatsappField,
  phone: phoneField,
  active: z.boolean(),
  round_robin: z.boolean(),
});

export type SellerInput = z.infer<typeof sellerSchema>;

/** EDITAR NOME: só o nome (correção de grafia da MESMA pessoa). */
export const sellerNameSchema = z.object({ name: nameField });

/** CONTATO: WhatsApp/telefone/rodízio — nunca nome nem situação (ativa/inativa). */
export const sellerContactSchema = z.object({
  whatsapp_number: whatsappField,
  phone: phoneField,
  round_robin: z.boolean(),
});

export type SellerContactInput = z.infer<typeof sellerContactSchema>;
