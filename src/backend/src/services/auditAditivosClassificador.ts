// Auditoria Aditivos (Fase 2A) — classificador de arquivo.
//
// Só extrai FATOS de um arquivo do inventário: é aditivo? é modelo? é de 13º?
// fala de honorário? qual formato? tem assinatura? de que ano é?
// Não decide status nenhum. O que conta como "aditivo em dia", se "ASS" no nome
// vale como assinado e se o 13º fecha a pendência são decisões em aberto
// (docs/PLANO-AUDITORIA-CONTRATOS-ADITIVOS.md, seção 10, itens 3 a 5) e ficam
// na regra de status por empresa, não aqui.
//
// Regras calibradas no inventário real de 01/10/2026 (1.601 arquivos, 513 pastas):
// erros de digitação ("Termo Adtivo", "Termo Adivito", "TERMO ADITVO"), modelos
// ("MODELO TERMO ADITIVO.docx", pasta MODELO/), "FILIAL 13" que não é 13º e
// "ADITIVO_ASSINADO" com sublinhado.

import { semAcentoMaiusculo } from './auditNormalizacao';
import { isValidCNPJ } from '../utils/validators';

export type FormatoArquivo = 'word' | 'pdf' | 'imagem' | 'outro';

/**
 * - `digital`       PDF com assinatura digital embutida (/ByteRange) — vale mais que o nome.
 * - `pelo_nome`     "ASS", "ASSINADO", "ASSINADA" no nome, sem assinatura embutida.
 * - `declarada_sem` o nome diz "SEM ASSINATURA" / "NÃO ASSINADO".
 * - `nenhuma`       PDF ou imagem sem nenhum sinal de assinatura.
 * - `nao_se_aplica` Word e outros formatos editáveis: rascunho, não tem como estar assinado.
 */
export type SinalAssinatura = 'digital' | 'pelo_nome' | 'declarada_sem' | 'nenhuma' | 'nao_se_aplica';

export interface ArquivoParaClassificar {
  nome:            string;
  caminhoRelativo: string;
  ext:             string;
  modificadoEm:    Date;
  pdfAssinado:     boolean | null;
  pdfMarca:        string | null;
}

export interface ClassificacaoAditivo {
  /** O nome tem a palavra aditivo (ou aditamento), mesmo com erro de digitação. Modelos ficam de fora. */
  ehAditivo:        boolean;
  /** Arquivo-modelo ("MODELO TERMO ADITIVO.docx" ou dentro de uma pasta MODELO). Nunca é aditivo de cliente. */
  modelo:           boolean;
  /** Termo Aditivo de 13º (honorário de 13º). */
  decimoTerceiro:   boolean;
  /** O nome fala de honorário ("Termo Aditivo Honorário", "13º e Honorario"). */
  honorario:        boolean;
  formato:          FormatoArquivo;
  assinatura:       SinalAssinatura;
  /** A assinatura embutida tem marca ICP-Brasil. */
  icp:              boolean;
  /** Ano do aditivo: o que estiver escrito no nome; senão, o da data de modificação (fuso de São Paulo). */
  ano:              number;
  anoFonte:         'nome' | 'data_do_arquivo';
  /** CNPJ válido escrito no nome (só dígitos), ou null. */
  cnpjNoNome:       string | null;
  /** Nome no padrão que o próprio app gera: Termo_Aditivo_<RAZAO>_<CNPJ>.docx. */
  nomePadraoDoApp:  boolean;
}

const EXT_WORD   = new Set(['.docx', '.doc', '.odt', '.rtf']);
const EXT_IMAGEM = new Set(['.jpg', '.jpeg', '.png', '.jfif', '.tif', '.tiff', '.heic', '.webp', '.bmp']);

const FUSO = 'America/Sao_Paulo';

/** Palavras do nome, já sem acento e em maiúsculas. "_" separa palavra ("ADITIVO_ASSINADO"). */
export function palavras(texto: string): string[] {
  return semAcentoMaiusculo(texto).split(/[^A-Z0-9º°ª]+/).filter(Boolean);
}

function levenshtein(a: string, b: string): number {
  const linha = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let anterior = linha[0];
    linha[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const guardado = linha[j];
      linha[j] = Math.min(
        linha[j] + 1,
        linha[j - 1] + 1,
        anterior + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      anterior = guardado;
    }
  }
  return linha[b.length];
}

/** "ADITIVO", "ADITIVOS", "ADITAMENTO" e erros de digitação próximos ("ADTIVO", "ADIVITO", "ADITVO"). */
export function pareceAditivo(palavra: string): boolean {
  if (palavra.startsWith('ADITAMENT')) return true;
  if (!palavra.startsWith('AD') || palavra.length < 5 || palavra.length > 9) return false;
  return levenshtein(palavra, 'ADITIVO') <= 2 || levenshtein(palavra, 'ADITIVOS') <= 2;
}

const ORDINAL_13 = /^13[º°ª]$/;

/** 13º só quando é ordinal ("13º"), vem logo depois de "ADITIVO" ("Termo Aditivo 13") ou por extenso. */
function falaDe13(ps: string[]): boolean {
  for (let i = 0; i < ps.length; i++) {
    if (ORDINAL_13.test(ps[i])) return true;
    if (ps[i] === '13' && i > 0 && pareceAditivo(ps[i - 1])) return true;
    if (ps[i] === '13O' && i > 0 && pareceAditivo(ps[i - 1])) return true;
    if (ps[i] === 'DECIMO' && ps[i + 1] === 'TERCEIRO') return true;
  }
  return false;
}

function ehModelo(caminhoRelativo: string): boolean {
  // Primeiro segmento é a própria subpasta do contrato; o resto são subpastas e o arquivo.
  const segmentos = caminhoRelativo.split(/[\\/]/).slice(1);
  return segmentos.some((s) => palavras(s)[0] === 'MODELO');
}

function sinalDeAssinatura(ps: string[]): 'pelo_nome' | 'declarada_sem' | null {
  for (let i = 0; i < ps.length; i++) {
    const p = ps[i];
    const ehAss = p === 'ASS' || p === 'ASSINATURA' || /^ASSINAD[OA]S?$/.test(p);
    if (!ehAss) continue;
    if (ps[i - 1] === 'SEM' || ps[i - 1] === 'NAO') return 'declarada_sem';
    if (p !== 'ASSINATURA') return 'pelo_nome';
  }
  return null;
}

function formatoDe(ext: string): FormatoArquivo {
  const e = ext.toLowerCase();
  if (e === '.pdf') return 'pdf';
  if (EXT_WORD.has(e)) return 'word';
  if (EXT_IMAGEM.has(e)) return 'imagem';
  return 'outro';
}

function anoNoFuso(data: Date): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric' }).format(data));
}

function cnpjDoNome(nome: string): string | null {
  for (const m of nome.matchAll(/(?<!\d)(\d{14})(?!\d)/g)) {
    if (isValidCNPJ(m[1])) return m[1];
  }
  return null;
}

export function classificarAditivo(a: ArquivoParaClassificar): ClassificacaoAditivo {
  const semExt = a.nome.slice(0, a.nome.length - a.ext.length) || a.nome;
  const ps      = palavras(semExt);
  // Subpastas + arquivo, sem a subpasta do contrato: "Termo Aditivo 13º/MDH BRASIL - ….docx".
  const psCaminho = palavras(a.caminhoRelativo.split(/[\\/]/).slice(1).join(' '));
  const modelo  = ehModelo(a.caminhoRelativo);
  const formato = formatoDe(a.ext);

  let assinatura: SinalAssinatura;
  if (formato === 'pdf' && a.pdfAssinado) {
    assinatura = 'digital';
  } else if (formato === 'pdf' || formato === 'imagem') {
    assinatura = sinalDeAssinatura(ps) ?? 'nenhuma';
  } else {
    assinatura = 'nao_se_aplica';
  }

  const anoEscrito = ps.find((p) => /^20[1-3]\d$/.test(p));

  return {
    ehAditivo:       !modelo && ps.some(pareceAditivo),
    modelo,
    decimoTerceiro:  falaDe13(psCaminho),
    honorario:       ps.some((p) => p.startsWith('HONORARI')),
    formato,
    assinatura,
    icp:             assinatura === 'digital' && a.pdfMarca === 'icp',
    ano:             anoEscrito ? Number(anoEscrito) : anoNoFuso(a.modificadoEm),
    anoFonte:        anoEscrito ? 'nome' : 'data_do_arquivo',
    cnpjNoNome:      cnpjDoNome(a.nome),
    nomePadraoDoApp: /^Termo_Aditivo_.+_\d{14}\.docx$/i.test(a.nome),
  };
}
