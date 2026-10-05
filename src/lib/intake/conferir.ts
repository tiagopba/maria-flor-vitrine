// CONFERE GERAL — PURO. Compara os dados da cliente com a DANFE e a etiqueta
// (campos já extraídos pelos parsers existentes; nada é inventado).
import type { DanfeData, ShippingLabelData } from "../fulfillment/types.ts";
import { trackingCarrier } from "../fulfillment/post-sale.ts";
import { normalizeText, compareAddress, compareMoneyCents, toCents, type AddressInput, type FieldResult } from "./address.ts";
import { decideVerdict, type ConfereResult } from "./confere.ts";

export interface ExpectedData {
  /** Nome que a cliente informou. */
  customerName: string;
  /** CPF informado (só dígitos). */
  cpf: string;
  address: AddressInput;
  /** Destinatário esperado na etiqueta: a própria cliente ou a pessoa informada. */
  recipientName: string;
  /** Valor da venda em reais (sale_total). */
  saleTotal: number;
}

export interface ConfereInput {
  expected: ExpectedData;
  danfe: DanfeData | null;
  label: ShippingLabelData | null;
}

export interface ConfereOutcome extends ConfereResult {
  results: FieldResult[];
  /** Campos extraídos dos documentos (para exibir e para montar o registro definitivo). */
  extracted: Record<string, string | number | null>;
}

const EMPTY_ADDRESS: AddressInput = {
  street: null,
  number: null,
  complement: null,
  neighborhood: null,
  city: null,
  state: null,
  postalCode: null,
};

function prefixed(prefix: string, results: FieldResult[]): FieldResult[] {
  return results.map((r) => ({ ...r, field: `${prefix}${r.field}` }));
}

export function conferir(input: ConfereInput): ConfereOutcome {
  const { expected, danfe, label } = input;
  const results: FieldResult[] = [];

  if (!danfe) results.push({ field: "danfe_legivel", verdict: "REVIEW", reason: "A DANFE não pôde ser lida." });
  if (!label) results.push({ field: "etiqueta_legivel", verdict: "REVIEW", reason: "A etiqueta não pôde ser lida." });

  // CPF × DANFE (divergência é bloqueio; ausência é revisão)
  const danfeCpf = danfe?.customerDocument ?? null;
  if (!danfeCpf) results.push({ field: "cpf", verdict: "REVIEW", reason: "CPF não encontrado na DANFE." });
  else if (danfeCpf !== expected.cpf) results.push({ field: "cpf", verdict: "BLOCKED", reason: "CPF diferente do informado pela cliente." });
  else results.push({ field: "cpf", verdict: "OK", reason: "" });

  // Nome × DANFE: avaliação humana (nunca bloqueio automático)
  if (!danfe?.customerName) results.push({ field: "nome", verdict: "REVIEW", reason: "Nome não encontrado na DANFE." });
  else if (normalizeText(danfe.customerName) !== normalizeText(expected.customerName)) {
    results.push({ field: "nome", verdict: "REVIEW", reason: "Nome diferente do informado: revisar." });
  } else results.push({ field: "nome", verdict: "OK", reason: "" });

  // Endereço × DANFE. O CEP vem da etiqueta (a DANFE simplificada costuma não trazer).
  const danfeActual: AddressInput = {
    street: danfe?.addressLine ?? null,
    number: danfe?.addressNumber ?? null,
    complement: danfe?.addressComplement ?? null,
    neighborhood: danfe?.neighborhood ?? null,
    city: danfe?.city ?? null,
    state: danfe?.state ?? null,
    postalCode: label?.postalCode ?? danfe?.postalCode ?? null,
  };
  results.push(...prefixed("nf_", compareAddress(expected.address, danfeActual)));

  // Valor da NF-e × valor da venda, em centavos, sem tolerância
  results.push(compareMoneyCents(toCents(expected.saleTotal), toCents(danfe?.invoiceTotal ?? null)));

  // Destinatário e endereço da etiqueta × cliente
  const labelRecipient = label?.recipientName ?? null;
  if (!labelRecipient) results.push({ field: "etiqueta_destinatario", verdict: "REVIEW", reason: "Destinatário não encontrado na etiqueta." });
  else if (normalizeText(labelRecipient) !== normalizeText(expected.recipientName)) {
    results.push({ field: "etiqueta_destinatario", verdict: "BLOCKED", reason: "Destinatário da etiqueta incompatível." });
  } else results.push({ field: "etiqueta_destinatario", verdict: "OK", reason: "" });

  const labelActual: AddressInput = label
    ? {
        street: label.addressStreet ?? null,
        number: label.addressNumber ?? null,
        complement: label.addressComplement ?? null,
        neighborhood: label.neighborhood ?? null,
        city: label.city ?? null,
        state: label.state ?? null,
        postalCode: label.postalCode ?? null,
      }
    : EMPTY_ADDRESS;
  const labelResults = compareAddress(expected.address, labelActual);
  // J&T: a etiqueta real não separa o bairro de forma confiável. Bairro AUSENTE nela não é aviso:
  // fica não comparável naquele documento. Bairro presente segue a regra normal (REVIEW se diferente).
  // A comparação cliente × DANFE continua valendo.
  // Mesma regra para o complemento: a etiqueta J&T não o separa de forma confiável.
  const isJtLabel = trackingCarrier(label?.carrier) === "jt";
  const NOT_SEPARATED: Record<string, string> = {
    bairro: "Bairro não separado na etiqueta J&T: não comparável neste documento.",
    complemento: "Complemento não separado na etiqueta J&T: não comparável neste documento.",
  };
  if (isJtLabel) {
    const separated: Record<string, string | null | undefined> = {
      bairro: label?.neighborhood,
      complemento: label?.addressComplement,
    };
    for (const r of labelResults) {
      if (r.field in NOT_SEPARATED && !separated[r.field]) {
        r.verdict = "NOT_COMPARABLE";
        r.reason = NOT_SEPARATED[r.field];
      }
    }
  }
  results.push(...prefixed("etiqueta_", labelResults));

  // DANFE × etiqueta: rua, número, cidade, UF e CEP precisam bater quando ambos existem
  if (danfe && label) {
    results.push(...prefixed("nf_vs_etiqueta_", compareAddress(danfeActual, labelActual).filter((r) => ["rua", "numero", "cidade", "uf", "cep"].includes(r.field))));
  }

  const verdict = decideVerdict(results);
  return {
    ...verdict,
    results,
    extracted: {
      nfe_number: danfe?.nfeNumber ?? null,
      nfe_series: danfe?.nfeSeries ?? null,
      nfe_key: danfe?.nfeKey ?? null,
      nfe_protocol: danfe?.nfeProtocol ?? null,
      nfe_issued_at: danfe?.nfeIssuedAt ?? null,
      items_count: danfe?.itemsCount ?? null,
      invoice_total: danfe?.invoiceTotal ?? null,
      carrier: label?.carrier ?? null,
      shipping_service: label?.shippingService ?? null,
      tracking_code: label?.trackingCode ?? null,
      shipping_label_date: label?.labelDateTime ? label.labelDateTime.slice(0, 10) : null,
    },
  };
}
