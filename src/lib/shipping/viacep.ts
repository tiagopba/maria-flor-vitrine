"use client";

import { isValidStateCode } from "./brazilian-states";

/**
 * Consulta de endereço por CEP via ViaCEP — usada só para pré-preencher a
 * UF (e mostrar a cidade) no bloco de frete de /favoritos (ver
 * SmartShippingBlock), nunca para salvar endereço. A venda NUNCA depende
 * desta chamada: timeout, rede fora ou CEP não encontrado sempre devolvem
 * `null`, e quem chama cai no fallback manual de UF.
 */
const LOOKUP_TIMEOUT_MS = 6000;

export interface CepLookupResult {
  city: string;
  stateCode: string;
}

export async function lookupCep(cepDigits: string): Promise<CepLookupResult | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS);

  try {
    const res = await fetch(`https://viacep.com.br/ws/${cepDigits}/json/`, {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { erro?: boolean; localidade?: string; uf?: string };
    if (data.erro || !data.localidade || !data.uf || !isValidStateCode(data.uf)) return null;

    return { city: data.localidade, stateCode: data.uf };
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}
