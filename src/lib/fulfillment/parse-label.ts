import type { ShippingLabelData } from "./types.ts";
import { brDateToIso, splitLines } from "./text.ts";

const EMPTY: ShippingLabelData = {
  recipientName: null,
  addressLine: null,
  addressStreet: null,
  addressNumber: null,
  addressRemainder: null,
  postalCode: null,
  city: null,
  state: null,
  labelDateTime: null,
  carrier: null,
  trackingCode: null,
};

const RECIPIENT_HEADING = /^DESTINAT[ÁA]RIO\s*:?$/i;
const SENDER_HEADING = /^REMETENTE\s*:?/i;
const POSTAL_CITY_STATE = /^(\d{5})-?(\d{3})\s+(.+?)\s*\/\s*([A-Za-z]{2})$/;

// Só reconhece transportadora quando o nome aparece como TEXTO na etiqueta
// (muitas etiquetas trazem só o logo, que é imagem) — nunca por palpite.
const CARRIER_KEYWORDS: { pattern: RegExp; name: string }[] = [
  { pattern: /\bJ\s*&\s*T\b/, name: "J&T Express" },
  { pattern: /\bJADLOG\b/, name: "Jadlog" },
  { pattern: /\bLOGGI\b/, name: "Loggi" },
  { pattern: /\bTOTAL\s+EXPRESS\b/, name: "Total Express" },
  { pattern: /\bCORREIOS\b|\bSEDEX\b|\bPAC\b/, name: "Correios" },
];

function parseTracking(lines: string[], text: string): string | null {
  const correios = text.match(/\b[A-Z]{2}\d{9}[A-Z]{2}\b/);
  if (correios) return correios[0];

  // Código numérico impresso sozinho em uma linha (normalmente repetido:
  // código de barras + texto) — vence o que mais se repete; empate, o primeiro.
  const counts = new Map<string, number>();
  for (const line of lines) {
    if (/^\d{10,20}$/.test(line)) counts.set(line, (counts.get(line) ?? 0) + 1);
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [code, count] of counts) {
    if (count > bestCount) {
      best = code;
      bestCount = count;
    }
  }
  return best;
}

function parseCarrier(text: string, trackingCode: string | null): string | null {
  const upper = text.toUpperCase();
  for (const { pattern, name } of CARRIER_KEYWORDS) {
    if (pattern.test(upper)) return name;
  }
  if (trackingCode && /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(trackingCode)) return "Correios";
  return null;
}

function parseDateTime(text: string): string | null {
  const withTime = text.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (withTime) {
    const iso = brDateToIso(withTime[1], withTime[2], withTime[3]);
    if (iso) return `${iso}T${withTime[4]}:${withTime[5]}:${withTime[6] ?? "00"}`;
  }
  const dateOnly = text.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (dateOnly) {
    const iso = brDateToIso(dateOnly[1], dateOnly[2], dateOnly[3]);
    if (iso) return `${iso}T00:00:00`;
  }
  return null;
}

/** "Avenida X 960" → rua "Avenida X", número "960" (só se terminar em número). */
function splitStreetAndNumber(value: string): { street: string; number: string | null } {
  const m = value.match(/^(.*?)[,\s]+(\d+[A-Za-z]?|S\s*\/?\s*N)$/i);
  if (!m || !m[1].trim()) return { street: value.trim(), number: null };
  return { street: m[1].trim(), number: m[2].trim() };
}

/**
 * Lê o texto extraído de uma etiqueta de envio. Só usa o que está explícito
 * no texto — qualquer campo ausente volta null.
 */
export function parseShippingLabel(text: string): ShippingLabelData {
  const result: ShippingLabelData = { ...EMPTY };
  if (!text.trim()) return result;

  const lines = splitLines(text);

  const recipientIndex = lines.findIndex((line) => RECIPIENT_HEADING.test(line));
  if (recipientIndex >= 0) {
    const block: string[] = [];
    for (const line of lines.slice(recipientIndex + 1)) {
      if (SENDER_HEADING.test(line)) break;
      block.push(line);
    }

    const postalIndex = block.findIndex((line) => POSTAL_CITY_STATE.test(line));
    const addressBlock = postalIndex >= 0 ? block.slice(0, postalIndex) : block;

    if (postalIndex >= 0) {
      const postal = block[postalIndex].match(POSTAL_CITY_STATE);
      if (postal) {
        result.postalCode = `${postal[1]}${postal[2]}`;
        result.city = postal[3].trim();
        result.state = postal[4].toUpperCase();
      }
    }

    result.recipientName = addressBlock[0] ?? null;
    const addressLines = addressBlock.slice(1);
    if (addressLines.length > 0) {
      const joined = addressLines.join(" ");
      const commaIndex = joined.indexOf(",");
      const head = commaIndex >= 0 ? joined.slice(0, commaIndex) : addressLines[0];
      const rest = commaIndex >= 0 ? joined.slice(commaIndex + 1) : addressLines.slice(1).join(" ");

      const { street, number } = splitStreetAndNumber(head);
      result.addressLine = head.trim();
      result.addressStreet = street;
      result.addressNumber = number;
      result.addressRemainder = rest.trim() || null;
    }
  }

  result.labelDateTime = parseDateTime(text);
  result.trackingCode = parseTracking(lines, text);
  result.carrier = parseCarrier(text, result.trackingCode);

  return result;
}
