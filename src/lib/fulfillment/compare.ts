import type {
  ComparisonField,
  ComparisonFieldKey,
  DanfeData,
  DocumentComparison,
  FulfillmentFormValues,
  ShippingLabelData,
} from "./types.ts";
import { normalizeForCompare, onlyDigits } from "./text.ts";

// Abreviações de logradouro que não devem pesar na comparação ("Av." vs "Avenida").
const STREET_TYPE_TOKENS = new Set([
  "av",
  "avenida",
  "r",
  "rua",
  "al",
  "alameda",
  "tv",
  "travessa",
  "pc",
  "pca",
  "praca",
  "est",
  "estrada",
  "rod",
  "rodovia",
  "lgo",
  "largo",
]);

function tokens(value: string): string[] {
  return normalizeForCompare(value).split(" ").filter(Boolean);
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeForCompare(a);
  const nb = normalizeForCompare(b);
  if (!na || !nb) return false;
  if (na === nb || na.includes(nb) || nb.includes(na)) return true;

  // Nomes truncados/abreviados: primeiro e último nome iguais.
  const ta = na.split(" ");
  const tb = nb.split(" ");
  return ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1];
}

function streetsMatch(a: string, b: string): boolean {
  const ta = tokens(a).filter((t) => !STREET_TYPE_TOKENS.has(t));
  const tb = tokens(b).filter((t) => !STREET_TYPE_TOKENS.has(t));
  if (ta.length === 0 || tb.length === 0) return false;

  const setB = new Set(tb);
  const shared = ta.filter((t) => setB.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return shared / union >= 0.6;
}

function compareText(
  key: ComparisonFieldKey,
  label: string,
  danfeValue: string | null,
  labelValue: string | null,
  equals: (a: string, b: string) => boolean
): ComparisonField {
  const a = danfeValue?.trim() || null;
  const b = labelValue?.trim() || null;
  if (!a || !b) return { key, label, danfe: a, shippingLabel: b, status: "unavailable" };
  return { key, label, danfe: a, shippingLabel: b, status: equals(a, b) ? "match" : "mismatch" };
}

function joinAddress(street: string | null, number: string | null): string | null {
  const joined = [street, number].filter(Boolean).join(" ").trim();
  return joined || null;
}

/**
 * Compara o que há em comum entre DANFE e etiqueta. Tolerante de propósito:
 * ignora caixa, acento, pontuação e espaços — pequenas diferenças de
 * abreviação não devem bloquear ninguém, só aparecer na lista.
 */
export function compareDocuments(danfe: DanfeData | null, label: ShippingLabelData | null): DocumentComparison {
  const dAddress = joinAddress(danfe?.addressLine ?? null, danfe?.addressNumber ?? null);
  const lAddress = joinAddress(label?.addressStreet ?? label?.addressLine ?? null, label?.addressNumber ?? null);

  const fields: ComparisonField[] = [
    compareText("name", "Nome", danfe?.customerName ?? null, label?.recipientName ?? null, namesMatch),
    compareText(
      "postalCode",
      "CEP",
      danfe?.postalCode ?? null,
      label?.postalCode ?? null,
      (a, b) => onlyDigits(a) === onlyDigits(b)
    ),
    compareText(
      "city",
      "Cidade",
      danfe?.city ?? null,
      label?.city ?? null,
      (a, b) => normalizeForCompare(a) === normalizeForCompare(b)
    ),
    compareText(
      "state",
      "UF",
      danfe?.state ?? null,
      label?.state ?? null,
      (a, b) => normalizeForCompare(a) === normalizeForCompare(b)
    ),
    compareText("address", "Endereço", dAddress, lAddress, (a, b) => {
      const numberA = a.match(/(\d+[A-Za-z]?)\s*$/)?.[1];
      const numberB = b.match(/(\d+[A-Za-z]?)\s*$/)?.[1];
      if (numberA && numberB && normalizeForCompare(numberA) !== normalizeForCompare(numberB)) return false;
      return streetsMatch(a.replace(/\s*\d+[A-Za-z]?\s*$/, ""), b.replace(/\s*\d+[A-Za-z]?\s*$/, ""));
    }),
  ];

  const comparable = fields.filter((f) => f.status !== "unavailable");
  const overall =
    comparable.length === 0 ? "incomplete" : comparable.some((f) => f.status === "mismatch") ? "mismatch" : "match";

  return { overall, fields };
}

/** "2026-10-05T11:05:26" → "2026-10-05T11:05" (valor de <input type="datetime-local">). */
function toDateTimeLocal(value: string | null): string {
  return value ? value.slice(0, 16) : "";
}

/** Une os dois documentos nos campos do formulário. Quando os dois têm o dado, a DANFE (fiscal) vence. */
export function mergeToFormValues(
  danfe: DanfeData | null,
  label: ShippingLabelData | null
): FulfillmentFormValues {
  return {
    customerName: danfe?.customerName ?? label?.recipientName ?? "",
    customerDocument: danfe?.customerDocument ?? "",
    addressLine: danfe?.addressLine ?? label?.addressStreet ?? label?.addressLine ?? "",
    addressNumber: danfe?.addressNumber ?? label?.addressNumber ?? "",
    addressComplement: danfe?.addressComplement ?? label?.addressComplement ?? "",
    neighborhood: danfe?.neighborhood ?? label?.neighborhood ?? "",
    postalCode: danfe?.postalCode ?? label?.postalCode ?? "",
    city: danfe?.city ?? label?.city ?? "",
    state: danfe?.state ?? label?.state ?? "",
    nfeNumber: danfe?.nfeNumber ?? "",
    nfeSeries: danfe?.nfeSeries ?? "",
    nfeKey: danfe?.nfeKey ?? "",
    nfeProtocol: danfe?.nfeProtocol ?? "",
    nfeIssuedAt: danfe?.nfeIssuedAt ?? "",
    itemsCount: danfe?.itemsCount != null ? String(danfe.itemsCount) : "",
    invoiceTotal: danfe?.invoiceTotal != null ? danfe.invoiceTotal.toFixed(2).replace(".", ",") : "",
    carrier: label?.carrier ?? "",
    shippingService: label?.shippingService ?? "",
    trackingCode: label?.trackingCode ?? "",
    shippingLabelDate: toDateTimeLocal(label?.labelDateTime ?? null),
  };
}
