import type { ShippingLabelData } from "./types.ts";
import { brDateToIso, splitLines } from "./text.ts";

const EMPTY: ShippingLabelData = {
  recipientName: null,
  addressLine: null,
  addressStreet: null,
  addressNumber: null,
  addressRemainder: null,
  addressComplement: null,
  neighborhood: null,
  postalCode: null,
  city: null,
  state: null,
  labelDateTime: null,
  carrier: null,
  shippingService: null,
  trackingCode: null,
};

const RECIPIENT_HEADING = /^DESTINAT[ÁA]RIO\s*:?$/i;
const SENDER_HEADING = /^REMETENTE\s*:?/i;
// Nos Correios o "REMETENTE:" costuma vir colado no fim da linha anterior ("MARIA FLORREMETENTE:").
const SENDER_MARKER_ANYWHERE = /REMETENTE\s*:/i;
const RECIPIENT_BLOCK_START = /^(?:Assinatura|Recebedor|Documento)\b/i;
const POSTAL_CITY_STATE = /^(\d{5})-?(\d{3})\s+(.+?)\s*\/\s*([A-Za-z]{2})$/;

export const CORREIOS_TRACKING_PATTERN = /^[A-Z]{2}\d{9}BR$/;

// Só reconhece transportadora quando o nome aparece como TEXTO na etiqueta
// (muitas etiquetas trazem só o logo, que é imagem) — nunca por palpite.
const CARRIER_KEYWORDS: { pattern: RegExp; name: string }[] = [
  { pattern: /\bJ\s*&\s*T\b/, name: "J&T Express" },
  { pattern: /\bJADLOG\b/, name: "Jadlog" },
  { pattern: /\bLOGGI\b/, name: "Loggi" },
  { pattern: /\bTOTAL\s+EXPRESS\b/, name: "Total Express" },
  { pattern: /\bCORREIOS\b|\bSEDEX\b|\bPAC\b/, name: "Correios" },
];

// Ordem importa: "SEDEX" antes de "PAC".
const CORREIOS_SERVICES: { pattern: RegExp; name: string }[] = [
  { pattern: /\bSEDEX\b/, name: "SEDEX" },
  { pattern: /\bPAC\b/, name: "PAC" },
];

function parseTracking(lines: string[], text: string): string | null {
  // Correios: "AB 123 456 789 BR" (espaçado) ou "AB123456789BR" — sempre 2 letras + 9 dígitos + BR.
  const correios = text.match(/(?<![A-Za-z0-9])([A-Z]{2})[ \t]*(\d{3})[ \t]*(\d{3})[ \t]*(\d{3})[ \t]*BR(?![A-Za-z0-9])/);
  if (correios) {
    const code = `${correios[1]}${correios[2]}${correios[3]}${correios[4]}BR`;
    if (CORREIOS_TRACKING_PATTERN.test(code)) return code;
  }

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
  if (trackingCode && CORREIOS_TRACKING_PATTERN.test(trackingCode)) return "Correios";
  return null;
}

function parseShippingService(text: string, carrier: string | null): string | null {
  if (carrier !== "Correios") return null;
  const upper = text.toUpperCase();
  for (const { pattern, name } of CORREIOS_SERVICES) {
    if (pattern.test(upper)) return name;
  }
  return null;
}

// Só devolve data se ela estiver impressa na etiqueta — nunca inventa.
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

/** "Avenida X 960" ou "Avenida X, 960" → rua "Avenida X", número "960" (só se terminar em número). */
function splitStreetAndNumber(value: string): { street: string; number: string | null } {
  const m = value.match(/^(.*?)[,\s]+(\d+[A-Za-z]?|S\s*\/?\s*N)$/i);
  if (!m || !m[1].trim()) return { street: value.trim(), number: null };
  return { street: m[1].trim(), number: m[2].trim() };
}

function setPostalCityState(result: ShippingLabelData, line: string): void {
  const postal = line.match(POSTAL_CITY_STATE);
  if (!postal) return;
  result.postalCode = `${postal[1]}${postal[2]}`;
  result.city = postal[3].trim();
  result.state = postal[4].toUpperCase();
}

/** Layout J&T (e similares): bloco "DESTINATÁRIO", com quebras de linha no meio dos campos. */
function parseHeadedRecipient(lines: string[], recipientIndex: number, result: ShippingLabelData): void {
  const block: string[] = [];
  for (const line of lines.slice(recipientIndex + 1)) {
    if (SENDER_HEADING.test(line)) break;
    block.push(line);
  }

  const postalIndex = block.findIndex((line) => POSTAL_CITY_STATE.test(line));
  const addressBlock = postalIndex >= 0 ? block.slice(0, postalIndex) : block;
  if (postalIndex >= 0) setPostalCityState(result, block[postalIndex]);

  result.recipientName = addressBlock[0] ?? null;
  const addressLines = addressBlock.slice(1);
  if (addressLines.length === 0) return;

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

/**
 * Layout Correios: sem cabeçalho "DESTINATÁRIO" no texto — o bloco do
 * destinatário vai do fim da área de assinatura ("Recebedor/Assinatura/
 * Documento") até a linha "CEP Cidade/UF", antes do "REMETENTE:". Uma linha
 * por campo: nome, "rua, número", [complemento...], bairro.
 */
function parseUnheadedRecipient(lines: string[], result: ShippingLabelData): void {
  const senderIndex = lines.findIndex((line) => SENDER_MARKER_ANYWHERE.test(line));
  const scope = senderIndex >= 0 ? lines.slice(0, senderIndex) : lines;

  const postalIndex = scope.findIndex((line) => POSTAL_CITY_STATE.test(line));
  if (postalIndex < 0) return;

  let startIndex = -1;
  for (let i = 0; i < postalIndex; i += 1) {
    if (RECIPIENT_BLOCK_START.test(scope[i])) startIndex = i;
  }
  if (startIndex < 0) return;

  const block = scope.slice(startIndex + 1, postalIndex);
  if (block.length < 2) return;

  setPostalCityState(result, scope[postalIndex]);
  result.recipientName = block[0];

  const { street, number } = splitStreetAndNumber(block[1]);
  result.addressLine = block[1];
  result.addressStreet = street;
  result.addressNumber = number;

  const extra = block.slice(2);
  if (extra.length > 0) {
    result.neighborhood = extra[extra.length - 1];
    result.addressComplement = extra.slice(0, -1).join(" ") || null;
  }
}

/**
 * Lê o texto extraído de uma etiqueta de envio (J&T, Correios...). Só usa o
 * que está explícito no texto — qualquer campo ausente volta null.
 */
export function parseShippingLabel(text: string): ShippingLabelData {
  const result: ShippingLabelData = { ...EMPTY };
  if (!text.trim()) return result;

  const lines = splitLines(text);

  const recipientIndex = lines.findIndex((line) => RECIPIENT_HEADING.test(line));
  if (recipientIndex >= 0) parseHeadedRecipient(lines, recipientIndex, result);
  else parseUnheadedRecipient(lines, result);

  result.labelDateTime = parseDateTime(text);
  result.trackingCode = parseTracking(lines, text);
  result.carrier = parseCarrier(text, result.trackingCode);
  result.shippingService = parseShippingService(text, result.carrier);

  return result;
}
