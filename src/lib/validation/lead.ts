import { z } from "zod";

/**
 * Formulário do Grupo de Ofertas. `whatsapp` guarda o que a cliente digitou
 * (formato amigável); `whatsappNormalized` é derivado aqui — só dígitos,
 * com "55" na frente quando faltar — pro banco e pra deduplicar (mesma
 * regra de normalização já usada em `lib/validation/seller.ts`, adaptada
 * pra sempre incluir o DDI já que aqui é a própria cliente digitando, sem
 * DDI na maioria das vezes).
 */
export const offerLeadSchema = z
  .object({
    name: z.string().trim().min(2, "Informe seu nome completo.").max(120, "Nome muito longo."),
    whatsapp: z.string().trim().min(8, "Informe um WhatsApp válido."),
    email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
    marketingConsent: z.boolean(),
  })
  .transform((data) => {
    const digits = data.whatsapp.replace(/\D/g, "");
    const whatsappNormalized = digits.length > 0 && digits.length <= 11 ? `55${digits}` : digits;
    return { ...data, whatsappNormalized };
  })
  .refine((data) => data.whatsappNormalized.length >= 12 && data.whatsappNormalized.length <= 13, {
    message: "WhatsApp inválido — inclua o DDD.",
    path: ["whatsapp"],
  })
  .refine((data) => data.marketingConsent === true, {
    message: "É preciso aceitar para continuar.",
    path: ["marketingConsent"],
  });

export type OfferLeadInput = z.infer<typeof offerLeadSchema>;
