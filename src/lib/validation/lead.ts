import { z } from "zod";

/**
 * Formulário do Grupo de Ofertas — só nome, e-mail e consentimento. O
 * WhatsApp saiu desse fluxo (a coluna `leads.whatsapp` continua existindo
 * no banco, só não é mais coletada aqui).
 */
export const offerLeadSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome completo.").max(120, "Nome muito longo."),
  email: z.string().trim().toLowerCase().email("Informe um e-mail válido."),
  marketingConsent: z.boolean().refine((v) => v === true, {
    message: "É preciso aceitar para continuar.",
  }),
});

export type OfferLeadInput = z.infer<typeof offerLeadSchema>;
