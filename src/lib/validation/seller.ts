import { z } from "zod";

export const sellerSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(80, "Nome muito longo."),
  // Aceita formatos amigáveis no formulário (com parênteses, espaço, traço,
  // "+") e normaliza para só dígitos no formato internacional aqui — o
  // banco e a URL do wa.me sempre recebem o número já limpo.
  whatsapp_number: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .refine((v) => v.length >= 10 && v.length <= 15, "Número de WhatsApp inválido — inclua DDI e DDD."),
  phone: z
    .string()
    .trim()
    .max(20, "Telefone muito longo.")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
  active: z.boolean(),
  round_robin: z.boolean(),
});

export type SellerInput = z.infer<typeof sellerSchema>;
