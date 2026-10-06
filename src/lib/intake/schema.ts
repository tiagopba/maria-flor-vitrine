// Validação das solicitações (Admin) e dos dados enviados pela cliente — PURO.
import { z } from "zod";
import { isValidCpf } from "./cpf.ts";
import { PAYMENT_METHODS, isPaymentMethod } from "./payment.ts";
import { normalizeCustomerWhatsapp } from "../fulfillment/phone.ts";
import { BR_STATE_CODES } from "../fulfillment/historical-import/plan.ts";

const isRealIsoDate = (value: string) => {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
};

/** Nome completo: pelo menos duas palavras. */
const fullName = (label: string) =>
  z
    .string()
    .trim()
    .max(200, `${label} muito longo.`)
    .refine((v) => v.split(/\s+/).filter(Boolean).length >= 2, `${label} precisa ter nome e sobrenome.`);

const requiredText = (label: string, max = 200) =>
  z.string().trim().min(1, `Informe ${label.toLowerCase()}.`).max(max, `${label} muito longo.`);

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? null : v));

const whatsappField = z.string().transform((raw, ctx) => {
  const result = normalizeCustomerWhatsapp(raw);
  if (!result.ok) {
    ctx.addIssue({ code: "custom", message: result.error });
    return z.NEVER;
  }
  return result.value;
});

const moneyField = z.string().transform((raw, ctx) => {
  const normalized = raw.trim().replace(/^R\$\s*/i, "").replace(/\./g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    ctx.addIssue({ code: "custom", message: "Valor da venda inválido." });
    return z.NEVER;
  }
  const value = Number(normalized);
  if (value <= 0) {
    ctx.addIssue({ code: "custom", message: "O valor da venda precisa ser maior que zero." });
    return z.NEVER;
  }
  return value;
});

/** Formulário interno "SOLICITAR DADOS DO CLIENTE". */
export const adminIntakeSchema = z
  .object({
    customerName: fullName("Nome do cliente"),
    customerWhatsapp: whatsappField,
    // Vendedora obrigatória: a solicitação sempre tem uma vendedora ativa (conferida na action).
    sellerId: z
      .string()
      .trim()
      .min(1, "Escolha a vendedora.")
      .refine((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), "Vendedora inválida."),
    saleDate: z.string().trim().refine(isRealIsoDate, "Data da venda inválida."),
    saleTotal: moneyField,
    // Só as 4 formas novas. Código genérico antigo é recusado (não é aceito em nova solicitação).
    paymentMethod: z.string().refine(isPaymentMethod, "Escolha a forma de pagamento."),
    // Número da venda no sistema STI3: identificador textual, obrigatório, sem espaços nas pontas.
    sti3SaleId: z
      .string()
      .trim()
      .min(1, "Informe o número da venda STI3.")
      .max(40, "Número da venda STI3 muito longo."),
    internalNotes: optionalText(1000, "Observação muito longa."),
  });

export type AdminIntakeInput = z.output<typeof adminIntakeSchema>;

/** Dados que a cliente preenche no link público. Nada aqui vai para analytics ou log. */
export const publicSubmitSchema = z
  .object({
    fullName: fullName("Nome completo"),
    // CPF: obrigatório, com dígitos verificadores (isValidCpf). Vazio e inválido têm mensagens distintas.
    cpf: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v.length > 0, "Informe o CPF.")
      .refine((v) => v.length === 0 || isValidCpf(v), "Informe um CPF válido."),
    // E-mail obrigatório (não aceita só espaços) e em formato válido.
    email: z
      .string()
      .trim()
      .min(1, "Informe o e-mail.")
      .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Informe um e-mail válido."),
    whatsapp: whatsappField,
    deliveryToCustomer: z.boolean(),
    recipientName: z.string().trim(),
    postalCode: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v.length === 8, "CEP deve ter 8 dígitos."),
    addressLine: requiredText("Rua", 200),
    addressNumber: requiredText("Número", 30),
    // Complemento: texto OU a declaração "não possui complemento". Nunca vazio sem declarar.
    addressComplement: z.string().trim().max(200, "Complemento muito longo."),
    noComplement: z.boolean(),
    neighborhood: requiredText("Bairro", 120),
    city: requiredText("Cidade", 120),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => (BR_STATE_CODES as readonly string[]).includes(v), "UF inválida."),
  })
  .superRefine((v, ctx) => {
    if (!v.deliveryToCustomer && v.recipientName.split(/\s+/).filter(Boolean).length < 2) {
      ctx.addIssue({ code: "custom", path: ["recipientName"], message: "Informe o nome completo do destinatário." });
    }
    if (!v.noComplement && v.addressComplement === "") {
      ctx.addIssue({
        code: "custom",
        path: ["addressComplement"],
        message: "Informe o complemento ou marque 'Não possui complemento'.",
      });
    }
  });

export type PublicSubmitInput = z.output<typeof publicSubmitSchema>;

export { PAYMENT_METHODS };
