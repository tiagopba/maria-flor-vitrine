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

/**
 * CAIXA ALTA preservando acentos (ex.: "Goiânia" → "GOIÂNIA") — ".toUpperCase()"
 * nativo já preserva acento em JS. Usado nos campos "dados da cliente" do
 * formulário público: nome, rua, complemento, bairro e cidade.
 * Nunca aplicado retroativamente a dados já gravados.
 */
const upperText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .min(1, `Informe ${label.toLowerCase()}.`)
    .max(max, `${label} muito longo.`)
    .transform((v) => v.toUpperCase());

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

/**
 * EDITAR VENDA (pré-aprovação): só os 3 campos comerciais corrigíveis aqui —
 * valor, data e vendedora. A regra de quando isso invalida a conferência fica em
 * sale-details.ts (planIntakeSaleDetailsUpdate); este schema só valida o formato.
 */
export const editIntakeSaleDetailsSchema = z.object({
  saleTotal: moneyField,
  saleDate: z.string().trim().refine(isRealIsoDate, "Data da venda inválida."),
  sellerId: z
    .string()
    .trim()
    .min(1, "Escolha a vendedora.")
    .refine((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v), "Vendedora inválida."),
});

export type EditIntakeSaleDetailsInput = z.output<typeof editIntakeSaleDetailsSchema>;

/**
 * Dados que a cliente preenche no link público. Nada aqui vai para analytics ou log.
 *
 * Destinatário da entrega: sempre a própria cliente (`fullName`). Não existe mais
 * escolha de "entregar para outra pessoa" nem campo de destinatário alternativo
 * neste formulário — isso causava divergência no Confere Geral quando o nome
 * digitado aqui não batia com o nome na NF-e (emitida sempre para a cliente).
 * Registros antigos que têm um destinatário diferente continuam gravados e
 * legíveis como estão; esta regra vale só para envios novos.
 */
export const publicSubmitSchema = z
  .object({
    // Nome, rua, complemento, bairro e cidade: CAIXA ALTA preservando acentos.
    fullName: fullName("Nome completo").transform((v) => v.toUpperCase()),
    // CPF: obrigatório, com dígitos verificadores (isValidCpf). Vazio e inválido têm mensagens distintas.
    cpf: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v.length > 0, "Informe o CPF.")
      .refine((v) => v.length === 0 || isValidCpf(v), "Informe um CPF válido."),
    // E-mail obrigatório (não aceita só espaços) e em formato válido. Nunca vira caixa alta.
    email: z
      .string()
      .trim()
      .min(1, "Informe o e-mail.")
      .refine((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Informe um e-mail válido."),
    whatsapp: whatsappField,
    postalCode: z
      .string()
      .transform((v) => v.replace(/\D/g, ""))
      .refine((v) => v.length === 8, "CEP deve ter 8 dígitos."),
    addressLine: upperText("Rua", 200),
    addressNumber: requiredText("Número", 30),
    // Complemento: texto OU a declaração "não possui complemento". Nunca vazio sem declarar.
    addressComplement: z
      .string()
      .trim()
      .max(200, "Complemento muito longo.")
      .transform((v) => v.toUpperCase()),
    noComplement: z.boolean(),
    neighborhood: upperText("Bairro", 120),
    city: upperText("Cidade", 120),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => (BR_STATE_CODES as readonly string[]).includes(v), "UF inválida."),
  })
  .superRefine((v, ctx) => {
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
