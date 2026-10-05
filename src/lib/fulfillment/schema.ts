import { normalizeCustomerWhatsapp } from "./phone.ts";
import { z } from "zod";
import { DEFAULT_DELIVERY_STATUS, isDeliveryStatus, isFormDeliveryStatus, type DeliveryStatus } from "./delivery.ts";
import { CORREIOS_TRACKING_PATTERN } from "./parse-label.ts";
import { normalizeForCompare, onlyDigits, stripLeadingZeros } from "./text.ts";

/** America/Campo_Grande não tem horário de verão — mesmo fuso fixo usado no Dashboard. */
export const STORE_UTC_OFFSET = "-04:00";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .transform((v) => (v === "" ? null : v));

function isValidIsoDate(value: string): boolean {
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.getUTCMonth() === Number(m[2]) - 1 && date.getUTCDate() === Number(m[3]);
}

function parseMoneyInput(value: string): number | null {
  const v = value.trim().replace(/^R\$\s*/i, "");
  if (v === "") return null;
  const normalized = v.includes(",") ? v.replace(/\./g, "").replace(",", ".") : v;
  return /^\d+(\.\d{1,2})?$/.test(normalized) ? Number(normalized) : Number.NaN;
}

const isoDateField = (message: string) =>
  z
    .string()
    .trim()
    .refine((v) => v === "" || isValidIsoDate(v), message)
    .transform((v) => (v === "" ? null : v));

const digitsField = (lengths: number[], message: string) =>
  z
    .string()
    .transform(onlyDigits)
    .refine((v) => v === "" || lengths.includes(v.length), message)
    .transform((v) => (v === "" ? null : v));

// Campos de envio e de situação logística: usados tanto no cadastro quanto em "Atualizar situação".
const shippingFields = {
  carrier: optionalText(80, "Transportadora muito longa."),
  shippingService: optionalText(40, "Serviço muito longo."),
  trackingCode: z
    .string()
    .transform((v) => v.replace(/\s+/g, "").toUpperCase())
    .refine((v) => /^[A-Z0-9-]{0,40}$/.test(v), "Código de rastreio inválido.")
    .transform((v) => (v === "" ? null : v)),
};

// `allowUnknown`: UNKNOWN ("Situação não informada") só vale para registro HISTÓRICO — o cadastro
// por PDF nunca o aceita; na atualização, quem decide é a origem do registro (planDeliveryUpdate).
const deliveryFields = (allowUnknown: boolean) => ({
  expectedDeliveryDate: isoDateField("Previsão de entrega inválida."),
  deliveryStatus: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || (allowUnknown ? isDeliveryStatus(v) : isFormDeliveryStatus(v)),
      "Status de entrega inválido."
    )
    .transform((v): DeliveryStatus => (v === "" ? DEFAULT_DELIVERY_STATUS : (v as DeliveryStatus))),
  deliveredAt: isoDateField("Data de entrega inválida."),
  notes: optionalText(2000, "Observações muito longas (máx. 2000 caracteres)."),
});

type ShippingAndDelivery = {
  carrier: string | null;
  trackingCode: string | null;
  deliveryStatus: DeliveryStatus;
  deliveredAt: string | null;
};

function checkShippingAndDelivery(v: ShippingAndDelivery, ctx: z.RefinementCtx): void {
  // Rastreio dos Correios tem formato fixo: 2 letras + 9 dígitos + BR.
  if (
    v.carrier &&
    normalizeForCompare(v.carrier) === "correios" &&
    v.trackingCode &&
    !CORREIOS_TRACKING_PATTERN.test(v.trackingCode)
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["trackingCode"],
      message: "Rastreio dos Correios deve ter 2 letras + 9 dígitos + BR (ex: AB123456789BR).",
    });
  }
  if (v.deliveryStatus === "DELIVERED" && !v.deliveredAt) {
    ctx.addIssue({ code: "custom", path: ["deliveredAt"], message: "Informe a data de entrega." });
  }
  if (v.deliveredAt && v.deliveryStatus !== "DELIVERED") {
    ctx.addIssue({
      code: "custom",
      path: ["deliveredAt"],
      message: "A data de entrega só vale quando o status é Entregue.",
    });
  }
}

/**
 * Valida o formulário de revisão (tudo string, vem de FormData) e devolve já
 * no formato das colunas de `fulfillment_records`.
 */
export const fulfillmentRecordSchema = z
  .object({
    customerName: z.string().trim().min(1, "Informe o nome do cliente.").max(200, "Nome muito longo."),
    customerDocument: digitsField([11, 14], "CPF deve ter 11 dígitos (ou CNPJ com 14)."),
    // Opcional. Vazio = não cadastrado (nunca se inventa número).
    customerWhatsapp: z.string().optional().transform((raw, ctx) => {
      if (!raw || raw.trim() === "") return null;
      const result = normalizeCustomerWhatsapp(raw);
      if (!result.ok) {
        ctx.addIssue({ code: "custom", message: result.error });
        return null;
      }
      return result.value;
    }),
    addressLine: optionalText(200, "Endereço muito longo."),
    addressNumber: optionalText(30, "Número muito longo."),
    addressComplement: optionalText(200, "Complemento muito longo."),
    neighborhood: optionalText(120, "Bairro muito longo."),
    postalCode: digitsField([8], "CEP deve ter 8 dígitos."),
    city: optionalText(120, "Cidade muito longa."),
    state: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v === "" || /^[A-Z]{2}$/.test(v), "UF deve ter 2 letras.")
      .transform((v) => (v === "" ? null : v)),
    nfeNumber: z
      .string()
      .transform(onlyDigits)
      .refine((v) => v.length <= 9, "Número da NF-e inválido.")
      .transform((v) => (v === "" ? null : stripLeadingZeros(v))),
    nfeSeries: z
      .string()
      .transform(onlyDigits)
      .refine((v) => v.length <= 3, "Série inválida.")
      .transform((v) => (v === "" ? null : stripLeadingZeros(v))),
    nfeKey: digitsField([44], "A chave da NF-e deve ter 44 dígitos."),
    nfeProtocol: z
      .string()
      .transform(onlyDigits)
      .refine((v) => v.length <= 20, "Protocolo inválido.")
      .transform((v) => (v === "" ? null : v)),
    nfeIssuedAt: isoDateField("Data de emissão inválida."),
    itemsCount: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{1,4}$/.test(v), "Quantidade de itens inválida.")
      .transform((v) => (v === "" ? null : Number(v))),
    invoiceTotal: z
      .string()
      .transform(parseMoneyInput)
      .refine((v) => v === null || (Number.isFinite(v) && v < 10_000_000), "Valor total inválido."),
    ...shippingFields,
    shippingLabelDate: z
      .string()
      .trim()
      .refine(
        (v) =>
          v === "" ||
          (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v) &&
            isValidIsoDate(v.slice(0, 10)) &&
            !Number.isNaN(new Date(`${v}${v.length === 16 ? ":00" : ""}${STORE_UTC_OFFSET}`).getTime())),
        "Data da etiqueta inválida."
      )
      .transform((v) => (v === "" ? null : `${v}${v.length === 16 ? ":00" : ""}${STORE_UTC_OFFSET}`)),
    // Data da venda: obrigatória, escolhida/confirmada pelo funcionário — nunca derivada da NF-e.
    saleDate: z
      .string()
      .trim()
      .refine((v) => v !== "", "Informe a data da venda.")
      .refine((v) => v === "" || isValidIsoDate(v), "Data da venda inválida."),
    // Vendedora responsável e origem da venda são conceitos independentes (podem vir os dois, um ou nenhum).
    sellerId: z
      .string()
      .trim()
      .refine((v) => v === "" || UUID_PATTERN.test(v), "Vendedora inválida.")
      .transform((v) => (v === "" ? null : v)),
    // "X" era só a marca de "vendedora desconhecida" na planilha antiga: nunca é gravado.
    salesOrigin: z
      .string()
      .trim()
      .toUpperCase()
      .refine((v) => v.length <= 60, "Origem muito longa.")
      .transform((v) => (v === "" || v === "X" ? null : v)),
    ...deliveryFields(false),
  })
  .superRefine(checkShippingAndDelivery)
  .transform((v) => ({
    customer_name: v.customerName,
    customer_cpf: v.customerDocument,
    customer_whatsapp: v.customerWhatsapp,
    customer_name_search: normalizeForCompare(v.customerName),
    address_line: v.addressLine,
    address_number: v.addressNumber,
    address_complement: v.addressComplement,
    neighborhood: v.neighborhood,
    postal_code: v.postalCode,
    city: v.city,
    state: v.state,
    nfe_number: v.nfeNumber,
    nfe_series: v.nfeSeries,
    nfe_key: v.nfeKey,
    nfe_protocol: v.nfeProtocol,
    nfe_issued_at: v.nfeIssuedAt,
    items_count: v.itemsCount,
    invoice_total: v.invoiceTotal,
    carrier: v.carrier,
    shipping_service: v.shippingService,
    tracking_code: v.trackingCode,
    shipping_label_date: v.shippingLabelDate,
    sale_date: v.saleDate,
    seller_id: v.sellerId,
    sales_origin: v.salesOrigin,
    expected_delivery_date: v.expectedDeliveryDate,
    delivered_at: v.deliveredAt,
    delivery_status: v.deliveryStatus,
    notes: v.notes,
    // Cadastro por PDF: sempre PDF_UPLOAD (os dois PDFs são obrigatórios no banco).
    record_source: "PDF_UPLOAD" as const,
  }));

export type FulfillmentRecordFields = z.output<typeof fulfillmentRecordSchema>;

export const FORM_FIELD_NAMES = [
  "customerName",
  "customerDocument",
  "customerWhatsapp",
  "addressLine",
  "addressNumber",
  "addressComplement",
  "neighborhood",
  "postalCode",
  "city",
  "state",
  "nfeNumber",
  "nfeSeries",
  "nfeKey",
  "nfeProtocol",
  "nfeIssuedAt",
  "itemsCount",
  "invoiceTotal",
  "carrier",
  "shippingService",
  "trackingCode",
  "shippingLabelDate",
  "saleDate",
  "sellerId",
  "salesOrigin",
  "expectedDeliveryDate",
  "deliveryStatus",
  "deliveredAt",
  "notes",
] as const;

/** "Atualizar situação" (depois da criação): só campos operacionais — nunca dados do cliente. */
export const deliveryUpdateSchema = z
  .object({
    ...shippingFields,
    ...deliveryFields(true),
    confirmClearDelivery: z.string().transform((v) => v === "on" || v === "true"),
  })
  .superRefine(checkShippingAndDelivery)
  .transform((v) => ({
    carrier: v.carrier,
    shipping_service: v.shippingService,
    tracking_code: v.trackingCode,
    expected_delivery_date: v.expectedDeliveryDate,
    delivery_status: v.deliveryStatus,
    delivered_at: v.deliveredAt,
    notes: v.notes,
    confirmClearDelivery: v.confirmClearDelivery,
  }));

export type DeliveryUpdateInput = z.output<typeof deliveryUpdateSchema>;

export const DELIVERY_UPDATE_FIELD_NAMES = [
  "carrier",
  "shippingService",
  "trackingCode",
  "expectedDeliveryDate",
  "deliveryStatus",
  "deliveredAt",
  "notes",
  "confirmClearDelivery",
] as const;
