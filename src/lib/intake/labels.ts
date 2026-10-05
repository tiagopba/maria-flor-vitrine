// Nomes de campo da conferência → texto em português (PURO).
const BASE: Record<string, string> = {
  cpf: "CPF",
  nome: "Nome",
  rua: "Rua",
  numero: "Número",
  complemento: "Complemento",
  bairro: "Bairro",
  cidade: "Cidade",
  uf: "UF",
  cep: "CEP",
  valor: "Valor",
  destinatario: "Destinatário",
  danfe_legivel: "DANFE legível",
  etiqueta_legivel: "Etiqueta legível",
};

const SOURCES: [string, string][] = [
  ["nf_vs_etiqueta_", "NF-e × etiqueta: "],
  ["etiqueta_", "Etiqueta: "],
  ["nf_", "NF-e: "],
];

export function fieldLabel(field: string): string {
  for (const [prefix, text] of SOURCES) {
    if (field.startsWith(prefix)) return `${text}${BASE[field.slice(prefix.length)] ?? field.slice(prefix.length)}`;
  }
  return BASE[field] ?? field;
}
