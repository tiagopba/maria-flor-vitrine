// Textos SINTÉTICOS, com a mesma estrutura dos PDFs reais (Bling DANFE
// Simplificado / etiqueta J&T) mas com dados inventados — nunca commitar
// PDFs ou textos reais de clientes.

/**
 * XML nfeProc SINTÉTICO, com a mesma estrutura técnica do caso real que motivou a
 * revisão do fluxo (NF-e 1215, série 1, autorizada, vNF 334.97, transportadora J&T) —
 * mas identidade, CPF, chave de acesso e endereço inventados (reaproveita a mesma
 * cliente fictícia "MARIA DA SILVA EXEMPLO" / CPF 111.444.777-35 do resto deste arquivo).
 * Chave de 44 dígitos: sintética, sem validar dígito verificador (só o formato importa
 * para o parser) — igual nos dois lugares em que aparece (infNFe/@Id e protNFe/infProt/chNFe).
 */
export const NFE_KEY_1215 = "35261012345678000199550010000012151123456780";
export const NFE_XML_1215 = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe${NFE_KEY_1215}" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <natOp>Venda de mercadoria</natOp>
        <mod>55</mod>
        <serie>1</serie>
        <nNF>1215</nNF>
        <dhEmi>2026-10-10T14:00:00-04:00</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <tpImp>4</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>0</cDV>
        <tpAmb>1</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>1</indFinal>
        <indPres>2</indPres>
        <procEmi>0</procEmi>
        <verProc>LojaExemplo 1.0</verProc>
      </ide>
      <dest>
        <CPF>11144477735</CPF>
        <xNome>MARIA DA SILVA EXEMPLO</xNome>
        <enderDest>
          <xLgr>Avenida Brasil</xLgr>
          <nro>1500</nro>
          <xCpl>APTO 12 B</xCpl>
          <xBairro>Jardim das Palmeiras</xBairro>
          <cMun>3550308</cMun>
          <xMun>Sao Paulo</xMun>
          <UF>SP</UF>
          <CEP>01310100</CEP>
          <cPais>1058</cPais>
          <xPais>Brasil</xPais>
        </enderDest>
        <indIEDest>9</indIEDest>
      </dest>
      <transp>
        <modFrete>1</modFrete>
        <transporta>
          <xNome>J&amp;T EXPRESS LOGISTICA LTDA</xNome>
        </transporta>
      </transp>
      <total>
        <ICMSTot>
          <vBC>0.00</vBC>
          <vICMS>0.00</vICMS>
          <vProd>334.97</vProd>
          <vFrete>0.00</vFrete>
          <vSeg>0.00</vSeg>
          <vDesc>0.00</vDesc>
          <vII>0.00</vII>
          <vIPI>0.00</vIPI>
          <vPIS>0.00</vPIS>
          <vCOFINS>0.00</vCOFINS>
          <vOutro>0.00</vOutro>
          <vNF>334.97</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>1</tpAmb>
      <verAplic>SP_NFE_PL010</verAplic>
      <chNFe>${NFE_KEY_1215}</chNFe>
      <dhRecbto>2026-10-10T14:01:00-04:00</dhRecbto>
      <nProt>135260000000001</nProt>
      <digVal>ZmFrZURpZ2VzdFZhbHVlRXhlbXBsbw==</digVal>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso da NF-e</xMotivo>
    </infProt>
  </protNFe>
</nfeProc>`;

/**
 * 4 XMLs nfeProc SINTÉTICOS, mesma estrutura técnica dos 4 casos reais
 * conferidos manualmente na rodada do override de frete legado (NF-e
 * 1217/1218/1219/1220) — identidade, CPF, chave e endereço inventados
 * (reaproveita a mesma cliente fictícia "MARIA DA SILVA EXEMPLO" / CPF
 * 111.444.777-35 do resto deste arquivo); só nNF e vNF/vProd mudam, pra
 * reproduzir exatamente os valores que motivaram a decisão: Fabiane,
 * Beatriz e Daniela sem divergência de valor; Tatiane com vNF R$139,99
 * contra venda de R$173,99 (diferença de R$34,00, compatível com frete
 * legado não incluído na NF-e).
 */
function buildSyntheticNfeXml(nNF: string, vNF: string, keySuffix: string): string {
  const key = `3526101234567800019955001${nNF.padStart(7, "0")}${keySuffix}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe xmlns="http://www.portalfiscal.inf.br/nfe">
    <infNFe Id="NFe${key}" versao="4.00">
      <ide>
        <cUF>35</cUF>
        <natOp>Venda de mercadoria</natOp>
        <mod>55</mod>
        <serie>1</serie>
        <nNF>${nNF}</nNF>
        <dhEmi>2026-10-14T14:00:00-04:00</dhEmi>
        <tpNF>1</tpNF>
        <idDest>1</idDest>
        <tpImp>4</tpImp>
        <tpEmis>1</tpEmis>
        <cDV>0</cDV>
        <tpAmb>1</tpAmb>
        <finNFe>1</finNFe>
        <indFinal>1</indFinal>
        <indPres>2</indPres>
        <procEmi>0</procEmi>
        <verProc>LojaExemplo 1.0</verProc>
      </ide>
      <dest>
        <CPF>11144477735</CPF>
        <xNome>MARIA DA SILVA EXEMPLO</xNome>
        <enderDest>
          <xLgr>Avenida Brasil</xLgr>
          <nro>1500</nro>
          <xCpl>APTO 12 B</xCpl>
          <xBairro>Jardim das Palmeiras</xBairro>
          <cMun>3550308</cMun>
          <xMun>Sao Paulo</xMun>
          <UF>SP</UF>
          <CEP>01310100</CEP>
          <cPais>1058</cPais>
          <xPais>Brasil</xPais>
        </enderDest>
        <indIEDest>9</indIEDest>
      </dest>
      <transp>
        <modFrete>1</modFrete>
        <transporta>
          <xNome>J&amp;T EXPRESS LOGISTICA LTDA</xNome>
        </transporta>
      </transp>
      <total>
        <ICMSTot>
          <vBC>0.00</vBC>
          <vICMS>0.00</vICMS>
          <vProd>${vNF}</vProd>
          <vFrete>0.00</vFrete>
          <vSeg>0.00</vSeg>
          <vDesc>0.00</vDesc>
          <vII>0.00</vII>
          <vIPI>0.00</vIPI>
          <vPIS>0.00</vPIS>
          <vCOFINS>0.00</vCOFINS>
          <vOutro>0.00</vOutro>
          <vNF>${vNF}</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <tpAmb>1</tpAmb>
      <verAplic>SP_NFE_PL010</verAplic>
      <chNFe>${key}</chNFe>
      <dhRecbto>2026-10-14T14:01:00-04:00</dhRecbto>
      <nProt>135260000000001</nProt>
      <digVal>ZmFrZURpZ2VzdFZhbHVlRXhlbXBsbw==</digVal>
      <cStat>100</cStat>
      <xMotivo>Autorizado o uso da NF-e</xMotivo>
    </infProt>
  </protNFe>
</nfeProc>`;
}

/** Fabiane — NF-e 1217, R$529,94, sem divergência de valor (frete R$0,00 na NF-e, igual à venda). */
export const NFE_XML_1217_FABIANE = buildSyntheticNfeXml("1217", "529.94", "111234567801");
/** Beatriz — NF-e 1218, R$192,98, sem divergência de valor. */
export const NFE_XML_1218_BEATRIZ = buildSyntheticNfeXml("1218", "192.98", "111234567802");
/** Daniela — NF-e 1219, R$169,97, sem divergência de valor. */
export const NFE_XML_1219_DANIELA = buildSyntheticNfeXml("1219", "169.97", "111234567803");
/** Tatiane — NF-e 1220, R$139,99 — venda real era R$173,99 (diferença de R$34,00 de frete legado). */
export const NFE_XML_1220_TATIANE = buildSyntheticNfeXml("1220", "139.99", "111234567804");

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
