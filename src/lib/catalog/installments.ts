export interface InstallmentPlanInput {
  /** Preço a prazo/cartão — o campo `price` existente do produto. */
  price: number;
  maxInstallmentsOverride: number | null;
  defaultMaxInstallments: number;
  minInstallmentValue: number;
  installmentsEnabled: boolean;
}

/**
 * Quantas parcelas sem juros cabem — ou `null` quando parcelamento não deve
 * aparecer (desativado globalmente, teto configurado menor que 2, ou nem
 * 2 parcelas cabem respeitando o valor mínimo da parcela). O override do
 * produto nunca ignora o valor mínimo: ele só troca o teto de onde a busca
 * começa, a redução por causa do mínimo sempre acontece depois.
 *
 * "Sem juros" aqui quer dizer literalmente isso — nunca exibimos o valor de
 * cada parcela (só a contagem), então não existe soma de parcelas pra bater
 * com o total e não há arredondamento monetário a resolver nesta função.
 * Trabalha em centavos inteiros só pra comparar com o mínimo sem os
 * problemas de comparação de ponto flutuante.
 */
export function calculateInstallmentCount({
  price,
  maxInstallmentsOverride,
  defaultMaxInstallments,
  minInstallmentValue,
  installmentsEnabled,
}: InstallmentPlanInput): number | null {
  if (!installmentsEnabled) return null;

  const maxAllowed = maxInstallmentsOverride ?? defaultMaxInstallments;
  if (maxAllowed < 2) return null;

  const priceCents = Math.round(price * 100);
  const minCents = Math.round(minInstallmentValue * 100);

  if (minCents <= 0) return maxAllowed;

  let n = maxAllowed;
  while (n > 1 && Math.floor(priceCents / n) < minCents) {
    n--;
  }

  return n >= 2 ? n : null;
}
