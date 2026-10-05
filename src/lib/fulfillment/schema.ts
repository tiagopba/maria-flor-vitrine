import { z } from "zod";
import { normalizeForCompare, onlyDigits, stripLeadingZeros } from "./text.ts";

/** America/Campo_Grande não tem horário de verão — mesmo fuso fixo usado no Dashboard. */
export const STORE_UTC_OFFSET = "-04:00";

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

const digitsField = (lengths: number[], message: string) =>
  z
    .string()
    .transform(onlyDigits)
    .refine((v) => v === "" || lengths.includes(v.length), message)
    .transform((v) => (v === "" ? null : v));

/**
 * Valida o formulário de revisão (tudo string, vem de FormData) e devolve já
 * no formato das colunas de `fulfillment_records`.
 */
export const fulfillmentRecordSchema = z
  .object({
    customerName: z.string().trim().min(1, "Informe o nome do cliente.").max(200, "Nome muito longo."),
    customerDocument: digitsField([11, 14], "CPF deve ter 11 dígitos (ou CNPJ com 14)."),
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
    nfeIssuedAt: z
      .string()
      .trim()
      .refine((v) => v === "" || isValidIsoDate(v), "Data de emissão inválida.")
      .transform((v) => (v === "" ? null : v)),
    itemsCount: z
      .string()
      .trim()
      .refine((v) => v === "" || /^\d{1,4}$/.test(v), "Quantidade de itens inválida.")
      .transform((v) => (v === "" ? null : Number(v))),
    invoiceTotal: z
      .string()
      .transform(parseMoneyInput)
      .refine((v) => v === null || (Number.isFinite(v) && v < 10_000_000), "Valor total inválido."),
    carrier: optionalText(80, "Transportadora muito longa."),
    trackingCode: z
      .string()
      .transform((v) => v.replace(/\s+/g, "").toUpperCase())
      .refine((v) => /^[A-Z0-9-]{0,40}$/.test(v), "Código de rastreio inválido.")
      .transform((v) => (v === "" ? null : v)),
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
  })
  .transform((v) => ({
    customer_name: v.customerName,
    customer_cpf: v.customerDocument,
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
    tracking_code: v.trackingCode,
    shipping_label_date: v.shippingLabelDate,
  }));

export type FulfillmentRecordFields = z.output<typeof fulfillmentRecordSchema>;

export const FORM_FIELD_NAMES = [
  "customerName",
  "customerDocument",
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
  "trackingCode",
  "shippingLabelDate",
] as const;
