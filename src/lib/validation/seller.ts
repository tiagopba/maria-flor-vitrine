import { z } from "zod";

export const sellerSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome.").max(80, "Nome muito longo."),
  whatsapp_number: z
    .string()
    .trim()
    .min(8, "Número de WhatsApp inválido.")
    .max(20, "Número de WhatsApp inválido.")
    .regex(/^\+?[0-9]+$/, "Use só dígitos (com DDI e DDD), ex: 5511999998888."),
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
