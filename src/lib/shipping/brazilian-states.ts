/**
 * Lista fixa dos 26 estados + DF — único ponto de verdade pro seletor de
 * "Para qual estado será o envio?" em /favoritos e pro Admin de Frete
 * grátis. Não é uma tabela no banco: é a mesma lista fechada em qualquer
 * lugar do Brasil, nunca precisa ser editada pelo Admin.
 */
export interface BrazilianState {
  code: string;
  name: string;
}

export const BRAZILIAN_STATES: BrazilianState[] = [
  { code: "AC", name: "Acre" },
  { code: "AL", name: "Alagoas" },
  { code: "AP", name: "Amapá" },
  { code: "AM", name: "Amazonas" },
  { code: "BA", name: "Bahia" },
  { code: "CE", name: "Ceará" },
  { code: "DF", name: "Distrito Federal" },
  { code: "ES", name: "Espírito Santo" },
  { code: "GO", name: "Goiás" },
  { code: "MA", name: "Maranhão" },
  { code: "MT", name: "Mato Grosso" },
  { code: "MS", name: "Mato Grosso do Sul" },
  { code: "MG", name: "Minas Gerais" },
  { code: "PA", name: "Pará" },
  { code: "PB", name: "Paraíba" },
  { code: "PR", name: "Paraná" },
  { code: "PE", name: "Pernambuco" },
  { code: "PI", name: "Piauí" },
  { code: "RJ", name: "Rio de Janeiro" },
  { code: "RN", name: "Rio Grande do Norte" },
  { code: "RS", name: "Rio Grande do Sul" },
  { code: "RO", name: "Rondônia" },
  { code: "RR", name: "Roraima" },
  { code: "SC", name: "Santa Catarina" },
  { code: "SP", name: "São Paulo" },
  { code: "SE", name: "Sergipe" },
  { code: "TO", name: "Tocantins" },
];

const STATE_BY_CODE = new Map(BRAZILIAN_STATES.map((s) => [s.code, s]));

export function isValidStateCode(code: string): boolean {
  return STATE_BY_CODE.has(code);
}

/** "Mato Grosso do Sul (MS)" — null se o código não for uma UF válida. */
export function getStateLabel(code: string): string | null {
  const state = STATE_BY_CODE.get(code);
  return state ? `${state.name} (${state.code})` : null;
}
