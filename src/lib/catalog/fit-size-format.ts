/**
 * Único formatador de "veste X" — usado em toda tela que mostra a
 * compatibilidade `tamanho da etiqueta → numeração que veste` (página de
 * produto, Minhas Roupas, mensagem de WhatsApp, Seleção compartilhável).
 * Nunca infere nada: só formata o array de `fit_size` já cadastrado em
 * `product_size_fit_compatibilities` para aquele label_size.
 *
 * Regra: sequências consecutivas de 2 em 2 (a grade padrão de numeração)
 * viram "X ao Y"; qualquer lacuna quebra a sequência, nunca finge que um
 * número no meio também veste. Grupos são listados separados por vírgula,
 * com "e" antes do último (formatação natural em português).
 */
export function formatFitSizesLabel(fitSizes: number[]): string | null {
  if (fitSizes.length === 0) return null;

  const sorted = [...new Set(fitSizes)].sort((a, b) => a - b);
  const runs: number[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const lastRun = runs[runs.length - 1];
    const previous = lastRun[lastRun.length - 1];
    if (current - previous === 2) {
      lastRun.push(current);
    } else {
      runs.push([current]);
    }
  }

  const parts = runs.map((run) => (run.length === 1 ? String(run[0]) : `${run[0]} ao ${run[run.length - 1]}`));

  return `Veste ${joinPortugueseList(parts)}`;
}

function joinPortugueseList(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  if (parts.length === 2) return `${parts[0]} e ${parts[1]}`;
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}
