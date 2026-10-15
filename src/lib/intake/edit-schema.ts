// Validação da edição administrativa (Admin/Master) de uma solicitação — PURO.
import { z } from "zod";
import { fullName, moneyField, optionalText, requiredText, upperOptionalText, upperText, whatsappField } from "./schema.ts";
import { isValidCpf } from "./cpf.ts";
import { isPaymentMethod } from "./payment.ts";
import { BR_STATE_CODES } from "../fulfillment/historical-import/plan.ts";

const isRealIsoDate = (value: string) => {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
};

/** Campos "da venda": sempre existem desde a criação, independente da cliente já ter enviado dados. */
export const editSaleSchema = z.object({
  sti3SaleId: z.string().trim().min(1, "Informe o número da venda STI3.").max(40, "Número da venda STI3 muito longo."),
  customerName: fullName("Cliente"),
  customerWhatsapp: whatsappField,
  sellerId: z
    .string()
    .trim()
    .min(1, "Escolha a vendedora.")
    .refine((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), "Vendedora inválida."),
  saleDate: z.string().trim().refine(isRealIsoDate, "Data da venda inválida."),
  saleTotal: moneyField,
  paymentMethod: z.string().refine(isPaymentMethod, "Escolha a forma de pagamento."),
  internalNotes: optionalText(1000, "Observação muito longa."),
});

export type EditSaleInput = z.output<typeof editSaleSchema>;

/**
 * Campos "da cliente": só existem depois que ela enviou os dados pelo link público
 * (status diferente de AWAITING_CUSTOMER_DATA). Nome, rua, complemento, bairro,
 * cidade, destinatário e UF são normalizados em CAIXA ALTA preservando acentos —
 * mesmos dados que entram na comparação com o XML da NF-e. E-mail nunca vira
 * caixa alta; CPF e CEP continuam normalizados só para dígitos.
 */
export const editCustomerSchema = z
  .object({
    submittedName: upperText("Nome completo", 200).refine(
      (v) => v.split(/\s+/).filter(Boolean).length >= 2,
      "Nome completo precisa ter nome e sobrenome."
    ),
    submittedCpf: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v.length > 0, "Informe o CPF.")
      .refine((v) => v.length === 0 || isValidCpf(v), "Informe um CPF válido."),
    submittedEmail: z
      .string()
      .trim()
      .min(1, "Informe o e-mail.")
      .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Informe um e-mail válido."),
    submittedWhatsapp: whatsappField,
    submittedDeliveryToCustomer: z.boolean(),
    submittedRecipientName: z.string().trim(),
    submittedPostalCode: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v.length === 8, "CEP deve ter 8 dígitos."),
    submittedAddressLine: upperText("Rua", 200),
    submittedAddressNumber: requiredText("Número", 30),
    submittedAddressComplement: upperOptionalText(200, "Complemento muito longo."),
    submittedNeighborhood: upperText("Bairro", 120),
    submittedCity: upperText("Cidade", 120),
    submittedState: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => (BR_STATE_CODES as readonly string[]).includes(v), "UF inválida."),
  })
  .transform((v) => ({ ...v, submittedRecipientName: v.submittedRecipientName.toUpperCase() }))
  .superRefine((v, ctx) => {
    if (!v.submittedDeliveryToCustomer && v.submittedRecipientName.split(/\s+/).filter(Boolean).length < 2) {
      ctx.addIssue({ code: "custom", path: ["submittedRecipientName"], message: "Informe o nome completo do destinatário." });
    }
  });

export type EditCustomerInput = z.output<typeof editCustomerSchema>;
