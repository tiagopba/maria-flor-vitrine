/** Tudo que o parser não achar vira null — nunca um valor inventado. */
export interface DanfeData {
  customerName: string | null;
  /** Só dígitos: 11 (CPF) ou 14 (CNPJ). */
  customerDocument: string | null;
  addressLine: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  neighborhood: string | null;
  /** Só dígitos (8). A DANFE simplificada normalmente não traz CEP. */
  postalCode: string | null;
  city: string | null;
  state: string | null;
  /** Sem zeros à esquerda ("000006" → "6"). */
  nfeNumber: string | null;
  nfeSeries: string | null;
  /** 44 dígitos. */
  nfeKey: string | null;
  nfeProtocol: string | null;
  /** aaaa-mm-dd */
  nfeIssuedAt: string | null;
  itemsCount: number | null;
  invoiceTotal: number | null;
}

export interface ShippingLabelData {
  recipientName: string | null;
  /** Rua + número como impresso na etiqueta ("Avenida X 960"). */
  addressLine: string | null;
  /** Rua sem o número, quando o número final pôde ser separado. */
  addressStreet: string | null;
  addressNumber: string | null;
  /**
   * Bairro + complemento exatamente como saíram do PDF, sem separar: a
   * etiqueta quebra linhas no meio de um campo e não há como saber, só
   * pelo texto, onde termina o bairro e começa o complemento.
   */
  addressRemainder: string | null;
  /** Só em layouts com uma linha por campo (Correios); em J&T fica null (ver addressRemainder). */
  addressComplement: string | null;
  neighborhood: string | null;
  postalCode: string | null;
  city: string | null;
  state: string | null;
  /** aaaa-mm-ddThh:mm:ss (horário local da loja, sem fuso). null se a etiqueta não trouxer data. */
  labelDateTime: string | null;
  carrier: string | null;
  /** Ex: "SEDEX", "PAC". Só preenchido quando o texto da etiqueta diz. */
  shippingService: string | null;
  trackingCode: string | null;
}

export type DocumentReadStatus = "ok" | "no_text" | "invalid";

export type ComparisonFieldKey = "name" | "postalCode" | "city" | "state" | "address";
export type ComparisonFieldStatus = "match" | "mismatch" | "unavailable";

export interface ComparisonField {
  key: ComparisonFieldKey;
  label: string;
  danfe: string | null;
  shippingLabel: string | null;
  status: ComparisonFieldStatus;
}

export interface DocumentComparison {
  /** "incomplete": nenhum campo pôde ser comparado (ex: só um PDF legível). */
  overall: "match" | "mismatch" | "incomplete";
  fields: ComparisonField[];
}

/** Valores do formulário de revisão — tudo string, "" = vazio. */
export interface FulfillmentFormValues {
  customerName: string;
  customerDocument: string;
  addressLine: string;
  addressNumber: string;
  addressComplement: string;
  neighborhood: string;
  postalCode: string;
  city: string;
  state: string;
  nfeNumber: string;
  nfeSeries: string;
  nfeKey: string;
  nfeProtocol: string;
  nfeIssuedAt: string;
  itemsCount: string;
  invoiceTotal: string;
  carrier: string;
  shippingService: string;
  trackingCode: string;
  /** aaaa-mm-ddThh:mm (input datetime-local) */
  shippingLabelDate: string;
}
