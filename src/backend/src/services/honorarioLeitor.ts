// Leitura do honorário no texto de um contrato ou termo aditivo.
//
// Padrões vistos nos documentos da rede (amostra de 02/10/2026):
//   contrato  "pagará … honorários mensais no valor de R$ 600,00 (seiscentos reais), mais o
//              valor adicional de R$ 45,00 (…) por funcionário registrado"
//   aditivo   "O valor do honorário mensal, anteriormente fixado em R$ 257,81 (…), passa a ser
//              de R$ 1.199,14"  ·  "os honorários mensais … passarão a ser de R$ 3.240,00"
// O aditivo anual de 2026 (troca do responsável técnico) e a cláusula do 13º ("1 (um)
// honorário mensal adicional") não têm valor: o leitor devolve null para eles.
//
// Mudou a regra? Suba LEITOR_VERSAO: o app relê os textos guardados sem ir à rede.

// v2 (05/10/2026): ignora valor em cláusula condicional ("caso o faturamento ultrapasse…
// serão reajustados para R$ X"), lê "permanecem no valor de R$ X", lê "reduzidos de R$ X para
// R$ Y" (vale o Y) e guarda os CNPJs citados.
export const LEITOR_VERSAO = 2;  // subir quando mudar qualquer regra abaixo

export type FormaLeitura = 'novo_valor' | 'valor_mensal' | 'mencao';
export type TipoDocumento = 'contrato' | 'aditivo' | 'outro';

export interface LeituraHonorario {
  valor:                   number;
  adicionalPorFuncionario: number | null;
  forma:                   FormaLeitura;
  /** O documento amarra o valor a faixa de faturamento ("enquanto o faturamento não ultrapassar…"). */
  condicional:             boolean;
  /** Trecho do texto onde o valor foi achado, para a pessoa conferir. */
  trecho:                  string;
}

/** Junta as quebras de linha do PDF: o valor costuma vir partido entre linhas. */
export function textoCorrido(texto: string): string {
  return consertarAcentos(texto).replace(/\s+/g, ' ').trim();
}

// ── PDF com acento trocado ────────────────────────────────────────
// Alguns PDFs assinados declaram a fonte como MacRoman, mas os bytes são Latin-1:
// "honorários" sai "honor·rios", "CLÁUSULA" sai "CL¡USULA", "serão" sai "ser„o".
// Os caracteres de 0x80 a 0xFF do MacRoman, em ordem:
const MAC_ROMAN =
  'ÄÅÇÉÑÖÜáàâäãåçéèêëíìîïñóòôöõúùûü†°¢£§•¶ß®©™´¨≠ÆØ∞±≤≥¥µ∂∑∏π∫ªºΩæø' +
  '¿¡¬√ƒ≈∆«»…\u00A0ÀÃÕŒœ–—“”‘’÷◊ÿŸ⁄€‹›ﬁﬂ‡·‚„‰ÂÊÁËÈÍÎÏÌÓÔ\uF8FFÒÚÛÙıˆ˜¯˘˙˚¸˝˛ˇ';
const DE_MAC_PARA_LATIN1 = new Map<string, string>();
for (let i = 0; i < MAC_ROMAN.length; i++) {
  const byte = 0x80 + i;
  // 0x80..0x9F não existem como letra em Latin-1; só remapeia o que vira letra/acento.
  if (byte >= 0xa0) DE_MAC_PARA_LATIN1.set(MAC_ROMAN[i], String.fromCharCode(byte));
}
/** Sinais que quase nunca aparecem em texto português correto. */
const SINAL_FORTE = /[·¡„‡√«∫™ÌÛı˙‚Ù]/;
const SINAL_ENTRE_LETRAS = /[a-zß-ÿ][ÁÈÍËÓÚÔÂÊ]|[ÁÈÍËÓÚÔÂÊ][a-zß-ÿ]/;

export function consertarAcentos(texto: string): string {
  const fortes = texto.match(new RegExp(SINAL_FORTE.source, 'g'))?.length ?? 0;
  if (fortes < 3) return texto;
  return texto.replace(/\S+/g, (palavra) => {
    if (!SINAL_FORTE.test(palavra) && !SINAL_ENTRE_LETRAS.test(palavra)) return palavra;
    let saida = '';
    for (const ch of palavra) saida += DE_MAC_PARA_LATIN1.get(ch) ?? ch;
    return saida;
  });
}

const MOEDA = String.raw`R\$\s*(?:R\$\s*)?`;                 // "R$ R$ 405,25" aparece em contrato
// "1.412,00" · "600,00" · "1621," (sem centavos) · "15000.00" (ponto decimal) · "600"
const NUMERO = String.raw`(\d[\d.]*(?:,\d{1,2})?)`;

/** Converte o número do documento em reais. NaN quando o formato não faz sentido. */
export function paraNumero(texto: string): number {
  const t = texto.replace(/\.+$/, '');
  if (t.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(t)) return NaN;
    return Number(t.replace(/\./g, '').replace(',', '.'));
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ''));
  if (/^\d+\.\d{1,2}$/.test(t)) return Number(t);
  if (/^\d+$/.test(t)) return Number(t);
  return NaN;
}

const VALOR_MAXIMO = 1_000_000;

// "honor.rio" e "funcion.rio": o "á" pode vir trocado mesmo depois do conserto.
const HONORARIO = String.raw`honor.rios?`;

// "reajustados", "reduzidos", "majorados"… e o que pode vir entre o "para" e o R$.
const MUDOU = String.raw`(?:reajustad|alterad|atualizad|reduzid|majorad|aumentad|corrigid)[oa]s?`;
const NOVO_VALOR = String.raw`(?:o\s+)?(?:(?:novo\s+)?valor(?:-base|\s+base)?\s+)?(?:mensal\s+)?(?:de\s+)?`;

const PADROES: { forma: FormaLeitura; re: RegExp }[] = [
  // Aditivo de honorário: o valor NOVO vem depois de "passa a ser".
  {
    forma: 'novo_valor',
    re: new RegExp(String.raw`passa(?:m|r.|r.o|ndo)?\s+a\s+(?:ser|vigorar|custar)\s+(?:de\s+|no\s+valor\s+de\s+|em\s+)?${MOEDA}${NUMERO}`, 'i'),
  },
  // "ficam reduzidos de R$ 810,50 (…) para o valor-base mensal de R$ 135,08": o valor NOVO é
  // o que vem depois do "para" (caso real MDH COMÉRCIO DE FERRO AÇO, 01/09/2026).
  {
    forma: 'novo_valor',
    re: new RegExp(String.raw`(?:passa(?:m|r.|r.o)?|${MUDOU})\s+de\s+${MOEDA}[\d.,]+[^.;]{0,160}?\bpara\s+${NOVO_VALOR}${MOEDA}${NUMERO}`, 'i'),
  },
  {
    forma: 'novo_valor',
    re: new RegExp(String.raw`${MUDOU}\s+para\s+${NOVO_VALOR}${MOEDA}${NUMERO}`, 'i'),
  },
  // Aditivo que mantém o valor: "Os honorários mensais atualmente praticados permanecem no
  // valor de R$ 810,50" (caso real CICERO A. LOPES, 25/06/2026).
  {
    forma: 'valor_mensal',
    re: new RegExp(String.raw`${HONORARIO}[^.;]{0,80}?permanece(?:m|r.o)?\s+(?:no\s+valor\s+de\s+|em\s+|de\s+)${MOEDA}${NUMERO}`, 'i'),
  },
  // Contrato (e aditivo antigo que refaz a cláusula): "honorários mensais no valor de R$".
  {
    forma: 'valor_mensal',
    re: new RegExp(String.raw`${HONORARIO}\s+(?:profissionais\s+|cont.beis\s+)?mensa(?:l|is)[^.;]{0,80}?valor\s+(?:mensal\s+|inicial\s+|total\s+)?(?:de\s+)?${MOEDA}${NUMERO}`, 'i'),
  },
  {
    forma: 'valor_mensal',
    re: new RegExp(String.raw`${HONORARIO}\s+(?:profissionais\s+|cont.beis\s+)?mensa(?:l|is)\s+(?:de\s+|em\s+)${MOEDA}${NUMERO}`, 'i'),
  },
  {
    forma: 'valor_mensal',
    re: new RegExp(String.raw`mensalidade[^.;]{0,60}?(?:valor\s+de\s+|de\s+)${MOEDA}${NUMERO}`, 'i'),
  },
  // Última tentativa: "Honorário contábil: R$ 600,00" (acordo comercial, proposta).
  // Até 3 palavras entre "honorário" e o valor; "R$ 360 mil" é faixa de faturamento, não honorário.
  {
    forma: 'mencao',
    re: new RegExp(String.raw`${HONORARIO}(?:\s+[^\s.;]+){0,3}?\s*:?\s*(?:de\s+|no\s+valor\s+de\s+)?${MOEDA}${NUMERO}(?!\d|\s*(?:mil\b|k\b))`, 'i'),
  },
];

/** Modelo com o valor em branco: "honorários mensais no valor de R$ ......". */
const VALOR_EM_BRANCO = new RegExp(String.raw`${HONORARIO}\s+(?:profissionais\s+|cont.beis\s+)?mensa(?:l|is)[^;]{0,80}?valor[^;]{0,20}?R\$\s*[._…\s]{3,}`, 'i');

const CONDICIONAL = /(?:enquanto|caso|se)\s+o\s+faturamento|faturamento\s+(?:mensal\s+|bruto\s+|anual\s+)*(?:do\s+cliente\s+|da\s+contratante\s+)?(?:n.o\s+)?(?:ultrapass|exced|for\s+superior)/i;

const ADICIONAL = new RegExp(String.raw`adicional\s+de\s+${MOEDA}${NUMERO}[^.;]{0,120}?funcion.rio`, 'i');

function trechoAoRedor(corrido: string, inicio: number, fim: number): string {
  const de = Math.max(0, inicio - 160);
  const ate = Math.min(corrido.length, fim + 120);
  return `${de > 0 ? '…' : ''}${corrido.slice(de, ate).trim()}${ate < corrido.length ? '…' : ''}`.slice(0, 600);
}

/**
 * O valor está numa cláusula condicional? Olha a frase até o valor: "Contudo, caso o
 * faturamento bruto mensal ultrapasse R$ 150.000,00, os honorários serão reajustados para
 * R$ 1.621,00" → sim. Esse valor só vale se a condição acontecer: não é o honorário atual.
 */
const CLAUSULA_CONDICIONAL = /\b(?:caso|se|na\s+hip.tese|enquanto|quando)\b[^.;]*\bfaturamento\b|\bfaturamento\b[^.;]*(?:ultrapass|exced|superior)/i;

export function emClausulaCondicional(corrido: string, posicao: number): boolean {
  const inicioDaFrase = Math.max(
    corrido.lastIndexOf('. ', posicao),
    corrido.lastIndexOf('; ', posicao),
    corrido.lastIndexOf(': ', posicao),
  );
  return CLAUSULA_CONDICIONAL.test(corrido.slice(inicioDaFrase + 1, posicao));
}

/** Todas as ocorrências do padrão, em ordem. */
function* ocorrencias(re: RegExp, texto: string): Generator<RegExpExecArray> {
  const global = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  for (let m = global.exec(texto); m; m = global.exec(texto)) yield m;
}

export function lerHonorario(texto: string): LeituraHonorario | null {
  const corrido = textoCorrido(texto);
  const emBranco = VALOR_EM_BRANCO.test(corrido);
  for (const { forma, re } of PADROES) {
    // Modelo sem valor preenchido: qualquer "R$" que sobrar é da tabela de faixas, não o honorário.
    if (emBranco && forma !== 'novo_valor') return null;
    for (const m of ocorrencias(re, corrido)) {
      if (emClausulaCondicional(corrido, m.index)) continue;
      const valor = paraNumero(m[1]);
      if (!(valor >= 10 && valor < VALOR_MAXIMO)) continue;
      return montarLeitura(corrido, m, valor, forma);
    }
  }
  return null;
}

function montarLeitura(corrido: string, m: RegExpExecArray, valor: number, forma: FormaLeitura): LeituraHonorario {
  const adicional = ADICIONAL.exec(corrido);
  const valorAdicional = adicional ? paraNumero(adicional[1]) : null;
  return {
    valor,
    adicionalPorFuncionario: valorAdicional && valorAdicional > 0 && valorAdicional < valor * 10 ? valorAdicional : null,
    forma,
    condicional: CONDICIONAL.test(corrido),
    trecho: trechoAoRedor(corrido, m.index, m.index + m[0].length),
  };
}

/** CNPJ da 041 Contabilidade (a CONTRATADA): aparece em todo contrato, não identifica o cliente. */
const RAIZ_DA_41 = '31052957';

/**
 * CNPJs citados no documento (só dígitos), sem o da 041. Serve para preferir o contrato da
 * própria empresa numa pasta de grupo (caso real CECATTO e E R N PEREIRA).
 * Só conta CNPJ com pontuação logo depois da palavra "CNPJ" ("inscrita no CNPJ sob o nº …"):
 * o bloco de assinatura digital traz o CNPJ da certificadora e números soltos que parecem CNPJ.
 */
export function cnpjsDoTexto(texto: string): string[] {
  const achados = new Set<string>();
  const corrido = texto.replace(/\s+/g, ' ');
  for (const m of corrido.matchAll(/CNPJ[^0-9]{0,60}?(\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2})/gi)) {
    const d = m[1].replace(/\D/g, '');
    if (!d.startsWith(RAIZ_DA_41)) achados.add(d);
  }
  return [...achados];
}

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6, julho: 7,
  agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

/**
 * Data do documento: a ÚLTIMA data por extenso ("Curitiba, 05 de maio de 2026"), que é a
 * da assinatura no fim do texto. Datas impossíveis ou fora de 2000..ano seguinte são ignoradas.
 * Devolve 'AAAA-MM-DD' ou null.
 */
export function dataDoDocumento(texto: string, agora = new Date()): string | null {
  const corrido = textoCorrido(texto);
  const re = /(\d{1,2})[º°]?\s+de\s+(janeiro|fevereiro|mar.o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+de\s+(\d{4})/gi;
  let ultima: string | null = null;
  for (const m of corrido.matchAll(re)) {
    const dia = Number(m[1]);
    const nomeMes = m[2].toLowerCase();
    const mes = nomeMes.startsWith('mar') ? 3 : MESES[nomeMes];
    const ano = Number(m[3]);
    if (!mes || ano < 2000 || ano > agora.getUTCFullYear() + 1) continue;
    const d = new Date(Date.UTC(ano, mes - 1, dia));
    if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) continue;
    ultima = `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  }
  return ultima;
}

/** Tipo pelo título (começo do texto); o nome do arquivo desempata. */
export function tipoDoDocumento(texto: string, nomeArquivo: string): TipoDocumento {
  const inicio = textoCorrido(texto).slice(0, 400).toUpperCase();
  const nome = nomeArquivo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  // Acordo comercial e proposta citam "contrato" no começo, mas não são contrato.
  if (/ACORDO|PROPOSTA|ORCAMENTO/.test(nome)) return 'outro';
  if (/TERMO\s+ADITIVO|ADITIVO\s+(AO|DE)\s+CONTRATO/.test(inicio)) return 'aditivo';
  if (/CONTRATO\s+(DE\s+)?PRESTA/.test(inicio)) return 'contrato';
  if (/ADITIVO|ADTIVO/.test(nome)) return 'aditivo';
  if (/CONTRATO/.test(nome)) return 'contrato';
  return 'outro';
}

export interface LeituraDoDocumento {
  tipo:     TipoDocumento;
  data:     string | null;
  leitura:  LeituraHonorario | null;
  /** CNPJs citados (só dígitos, sem o da 041). Vazio = documento sem CNPJ legível. */
  cnpjs:    string[];
}

export function lerDocumento(texto: string, nomeArquivo: string, agora = new Date()): LeituraDoDocumento {
  return {
    tipo:    tipoDoDocumento(texto, nomeArquivo),
    data:    dataDoDocumento(texto, agora),
    leitura: lerHonorario(texto),
    cnpjs:   cnpjsDoTexto(texto),
  };
}
