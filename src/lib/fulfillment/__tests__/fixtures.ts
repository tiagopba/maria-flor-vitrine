// Textos SINTÉTICOS, com a mesma estrutura dos PDFs reais (Bling DANFE
// Simplificado / etiqueta J&T) mas com dados inventados — nunca commitar
// PDFs ou textos reais de clientes.

export const DANFE_TEXT = `DANFE Simplificado - Etiqueta
LOJA EXEMPLO LTDA
CNPJ:11.222.333/0001-81 IE:11.111.111-1
R DAS FLORES, 100, SALA 1, CENTRO Cidade Exemplo - MS
5026 1011 2223 3300 0181 5500 2000 0000 0123 4567 8901
Protocolo de autorização de uso
150260000000001 02/10/2026 09:44:01-04:00
TIPO: 1 - Saída | Nº NFe: 000123 | SERIE: 2
Data de emissão: 02/10/2026
QTD. TOTAL DE ITENS 3
VALOR NOTA R$ 1.139,90
CONSUMIDOR
CNPJ/CPF/ID Estrangeiro: 111.444.777-35 MARIA DA SILVA EXEMPLO
Avenida Brasil, 1500, APTO 12 B, Jardim das Palmeiras - Sao Paulo - SP
INFORMAÇÕES ADICIONAIS DE INTERESSE DO CONTRIBUINTE
Total aproximado de tributos: R$ 10,00`;

export const NFE_KEY = "50261011222333000181550020000000012345678901";

export const LABEL_TEXT = `363-00
888100009999999
888100009999999
SP 363-00 265
DESTINATÁRIO
MARIA DA SILVA EXEMPLO
Avenida Brasil 1500, JARDIM DAS
PALMEIRAS
APTO 12 B
01310100 São Paulo/SP
05/10/2026
11:05:26
REMETENTE:
LOJA EXEMPLO
79500000 Cidade Exemplo/MS
LOJA EXEMPLO LTDA`;

export const LABEL_CORREIOS_TEXT = `CORREIOS
DESTINATÁRIO
JOAO PEREIRA
Rua das Acacias 45
Bairro Novo
79500-000 Cidade Exemplo/MS
PR123456789BR
05/10/2026
REMETENTE:
LOJA EXEMPLO`;

// Mesmo formato do texto extraído de uma etiqueta real dos Correios (SEDEX
// contrato): sem cabeçalho "DESTINATÁRIO", rastreio espaçado, "REMETENTE:"
// colado no fim da linha anterior e nenhuma data impressa. Dados inventados.
export const LABEL_CORREIOS_REAL_FORMAT_TEXT = `Contrato: 9912345678 SEDEX CONTRATO AG
AB 123 456 789 BR
RR
Recebedor:
Assinatura: Documento:
JOANA EXEMPLO DA SILVA
Avenida das Palmeiras, 1234
LOJA EXEMPLO CENTRO
Jardim Modelo
79000000 Cidade Teste/MS
LOJA EXEMPLOREMETENTE:
Rua das Flores, 100
Centro
79500000 Cidade Exemplo /MS`;

export const LABEL_CORREIOS_PAC_TEXT = LABEL_CORREIOS_REAL_FORMAT_TEXT.replace("SEDEX CONTRATO AG", "PAC CONTRATO AG");
