/**
 * SEO local — Maria Flor atende presencialmente só em Paranaíba/MS hoje;
 * toda a estratégia de local SEO desta rodada gira em torno dessa única
 * cidade (ver item 12 do pedido: preparar terreno pra outras cidades no
 * futuro, mas sem criar páginas artificiais por cidade agora — isso viraria
 * doorway page).
 */
export const LOCAL_SEO = {
  city: "Paranaíba",
  state: "MS",
  cityState: "Paranaíba MS",
  cityStateComma: "Paranaíba, MS",
} as const;

/** "CALÇA PANTALONA JEANS" -> "Calça Pantalona Jeans" — só pra `<title>`/meta
 * (nomes de produto são cadastrados em caixa alta; o H1 visível na página
 * continua mostrando o valor real, sem essa transformação). */
export function titleCase(text: string): string {
  return text
    .toLowerCase()
    .split(" ")
    .map((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/**
 * Título de categoria com o sufixo de gênero certo ("Femininas"/"Femininos")
 * quando dá pra inferir com segurança pela terminação do nome (plural
 * feminino em "-as", plural masculino em "-os" — cobre os nomes reais de
 * categoria da loja: Calças, Blusas, Vestidos, Conjuntos, Acessórios).
 * Fora desse padrão (ex: "Body", ou um nome de categoria mais livre tipo
 * "Look Eliara"), não força concordância nenhuma — errar o gênero
 * gramatical seria pior pra SEO/credibilidade do que simplesmente omitir o
 * adjetivo (item 2 do pedido: "não repetir texto de forma artificial").
 */
export function buildCategoryTitle(categoryName: string): string {
  const lower = categoryName.toLowerCase();
  if (lower.endsWith("as")) return `${categoryName} Femininas em ${LOCAL_SEO.cityState}`;
  if (lower.endsWith("os")) return `${categoryName} Femininos em ${LOCAL_SEO.cityState}`;
  return `${categoryName} em ${LOCAL_SEO.cityState}`;
}

export function buildCategoryDescription(categoryName: string): string {
  return `Confira ${categoryName.toLowerCase()} da Maria Flor — moda feminina em ${LOCAL_SEO.cityStateComma}. Novidades toda semana.`;
}

export function buildProductDescription(productName: string, productCode: string): string {
  return `${titleCase(productName)} — Código ${productCode}. Confira na Maria Flor, moda feminina em ${LOCAL_SEO.cityStateComma}.`;
}
