// CONFERE GERAL — XML-only — PURO. Compara os dados da cliente só com o XML autorizado
// da NF-e. Nunca compara contra etiqueta (não existe mais nesse fluxo) nem DANFE em PDF.
import type { NfeXmlData } from "../fulfillment/parse-nfe-xml.ts";
import { trackingCarrier } from "../fulfillment/post-sale.ts";
import { normalizePersonName, compareAddress, compareMoneyCents, toCents, type AddressInput, type FieldResult } from "./address.ts";
import type { ExpectedData } from "./conferir.ts";
import { decideVerdict, type ConfereResult } from "./confere.ts";

export interface ConfereXmlInput {
  expected: ExpectedData;
  xml: NfeXmlData;
}

export interface ConfereXmlOutcome extends ConfereResult {
  results: FieldResult[];
  extracted: Record<string, string | number | null>;
}

/**
 * "J&T Express" / "Correios" só quando há correspondência segura com o texto do XML
 * (mesma regra de trackingCarrier já usada no app) — nunca pela numeração do rastreio,
 * que nem existe ainda nessa etapa. Sem correspondência segura: null, vira pendência
 * junto com o rastreio, a funcionária escolhe depois.
 */
function normalizeCarrierName(raw: string | null): string | null {
  if (!raw) return null;
  const carrier = trackingCarrier(raw);
  if (carrier === "jt") return "J&T Express";
  if (carrier === "correios") return "Correios";
  return null;
}

export function conferirXml(input: ConfereXmlInput): ConfereXmlOutcome {
  const { expected, xml } = input;
  const results: FieldResult[] = [];

  // CPF/CNPJ × XML
  if (!xml.recipientDocument) results.push({ field: "cpf", verdict: "REVIEW", reason: "CPF/CNPJ não encontrado no XML." });
  else if (xml.recipientDocument !== expected.cpf) {
    results.push({ field: "cpf", verdict: "BLOCKED", reason: "CPF diferente do informado pela cliente." });
  } else results.push({ field: "cpf", verdict: "OK", reason: "" });

  // Destinatário × cliente (ou pessoa informada)
  if (!xml.recipientName) results.push({ field: "destinatario", verdict: "REVIEW", reason: "Destinatário não encontrado no XML." });
  else if (normalizePersonName(xml.recipientName) !== normalizePersonName(expected.recipientName)) {
    results.push({ field: "destinatario", verdict: "BLOCKED", reason: "Destinatário do XML incompatível." });
  } else results.push({ field: "destinatario", verdict: "OK", reason: "" });

  // Endereço × XML — mesma comparação (e as mesmas normalizações) já usadas para DANFE/etiqueta.
  const xmlAddress: AddressInput = {
    street: xml.addressLine,
    number: xml.addressNumber,
    complement: xml.addressComplement,
    neighborhood: xml.neighborhood,
    city: xml.city,
    state: xml.state,
    postalCode: xml.postalCode,
  };
  results.push(...compareAddress(expected.address, xmlAddress));

  // Valor da venda × vNF, em centavos, sem tolerância — exceto quando o
  // intake tem override de frete legado ativo (ver
  // fulfillment_intake_legacy_overrides); nunca um padrão, só quando o
  // chamador (startConferenciaAction) confirmou que existe um ativo.
  results.push(
    compareMoneyCents(toCents(expected.saleTotal), toCents(xml.invoiceTotal), {
      legacyFreightOverride: expected.legacyFreightOverrideActive === true,
    })
  );

  const verdict = decideVerdict(results);
  return {
    ...verdict,
    results,
    extracted: {
      nfe_number: xml.nfeNumber,
      nfe_series: xml.nfeSeries,
      nfe_key: xml.nfeKey,
      // Protocolo/emissão/itens não fazem parte do conjunto extraído do XML nesta V1
      // (não pedidos); ficam null — não inventamos valor que o XML não nos deu aqui.
      nfe_protocol: null,
      nfe_issued_at: null,
      items_count: null,
      invoice_total: xml.invoiceTotal,
      carrier: normalizeCarrierName(xml.carrierNameRaw),
      shipping_service: null,
      // Nunca conhecido nesta etapa: é exatamente o que "rastreamento pendente" cobre depois.
      tracking_code: null,
      shipping_label_date: null,
    },
  };
}
