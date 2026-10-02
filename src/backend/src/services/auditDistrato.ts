// Distrato da prestação de serviços — regras puras (decisões do Kauan em 02/10/2026).
//
// O distrato fica numa subpasta própria da pasta do cliente ("DISTRATO DE PRESTAÇÃO DE
// SERVIÇOS", "DISTRATO PRESTAÇÃO SERVIÇOS CONTABEIS", "DISTRATO BPO", "DISTRATO SOCIAL"…),
// ao lado da subpasta do contrato. Levantamento de 02/10: 31 subpastas, 28 da prestação de
// serviços contábeis, 2 de BPO e 1 social (dissolução da empresa).
//
// - Distrato contábil: a empresa sai das pendências (situação "Distrato" nos módulos).
//   Se houver contrato MAIS NOVO que o distrato, o cliente voltou: o distrato é desconsiderado.
// - Distrato BPO (só o BPO acabou) e distrato social (dissolução): só aviso.
// - Boleto, comprovante e recibo na subpasta não são o distrato.

import { classificarAditivo, type SinalAssinatura } from './auditAditivosClassificador';
import { semAcentoMaiusculo } from './auditNormalizacao';

export type TipoDistrato = 'contabil' | 'bpo' | 'social';

export interface ArquivoParaDistrato {
  nomePasta:       string;
  caminhoRelativo: string;
  nome:            string;
  ext:             string;
  modificadoEm:    Date;
  pdfAssinado:     boolean | null;
  pdfMarca:        string | null;
}

export interface DocumentoDistrato {
  nomePasta:       string;
  caminhoRelativo: string;
  nome:            string;
  tipo:            TipoDistrato;
  assinatura:      SinalAssinatura;
  /** "executará seus serviços até 31/07/2026" → '2026-07-31'. */
  dataFim:         string | null;
  /** Data por extenso no fim do texto (a da assinatura). */
  dataDocumento:   string | null;
  modificadoEm:    Date;
}

export interface ResultadoDistrato {
  /** Distrato contábil que vale: tira a empresa das pendências. */
  efetivo:        DocumentoDistrato | null;
  /** Distrato contábil com contrato mais novo depois dele (o cliente voltou). */
  desconsiderado: { documento: DocumentoDistrato; contratoMaisNovoEm: string } | null;
  /** Distrato BPO e social: só aviso. */
  avisos:         DocumentoDistrato[];
}

/** Primeira pasta do caminho relativo ("DISTRATO …/arquivo.pdf" → "DISTRATO …"). */
export function subpastaDe(caminhoRelativo: string): string {
  const i = caminhoRelativo.indexOf('/');
  return i < 0 ? '' : caminhoRelativo.slice(0, i);
}

export function ehSubpastaDistrato(nome: string): boolean {
  return /^DISTRAT/.test(semAcentoMaiusculo(nome));
}

export function arquivoEmDistrato(caminhoRelativo: string): boolean {
  return ehSubpastaDistrato(subpastaDe(caminhoRelativo));
}

export function tipoDoDistrato(subpasta: string, nomeArquivo: string): TipoDistrato {
  const s = semAcentoMaiusculo(subpasta);
  const a = semAcentoMaiusculo(nomeArquivo);
  if (/\bSOCIAL\b/.test(s)) return 'social';
  if (/\bBPO\b/.test(s) || /\bBPO\b/.test(a)) return 'bpo';
  return 'contabil';
}

const EXT_DOCUMENTO = new Set(['.pdf', '.docx', '.doc', '.odt', '.jpg', '.jpeg', '.png', '.jfif', '.tif', '.tiff']);

/** O que na subpasta é o próprio distrato (e não boleto, comprovante, recibo…). */
export function ehDocumentoDeDistrato(nome: string, ext: string): boolean {
  if (!EXT_DOCUMENTO.has(ext.toLowerCase())) return false;
  return !/\b(BOLETO|COMPROVANTE|RECIBO|NOTA FISCAL|NF|GUIA|EMAIL|E MAIL)\b/.test(semAcentoMaiusculo(nome).replace(/[^A-Z0-9]+/g, ' '));
}

function dataIso(dia: string, mes: string, ano: string): string | null {
  const d = Number(dia), m = Number(mes);
  let a = Number(ano);
  if (ano.length === 2) a += 2000;
  const data = new Date(Date.UTC(a, m - 1, d));
  if (data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d || a < 2000 || a > 2100) return null;
  return `${a}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/**
 * Último dia de serviço. Padrões vistos nos 84 distratos com texto (02/10/2026):
 * "executará seus serviços até 31/07/2026" (77), "executou seus serviços até …" (6) e, na
 * cláusula do pagamento, "a título de serviços prestados até …".
 */
export function dataFimDoDistrato(texto: string): string | null {
  const corrido = texto.replace(/\s+/g, ' ');
  const padroes = [
    /execut\S*\s+(?:os\s+)?seus\s+servi\S*\s+at\S\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i,
    /servi\S*\s+prestados\s+at\S\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i,
  ];
  for (const re of padroes) {
    const m = re.exec(corrido);
    if (m) {
      const d = dataIso(m[1], m[2], m[3]);
      if (d) return d;
    }
  }
  return null;
}

export function montarDocumentoDistrato(
  a: ArquivoParaDistrato,
  leitura: { dataFim: string | null; dataDocumento: string | null } | null,
): DocumentoDistrato {
  const { assinatura } = classificarAditivo({
    nome: a.nome, caminhoRelativo: a.caminhoRelativo, ext: a.ext, modificadoEm: a.modificadoEm,
    pdfAssinado: a.pdfAssinado, pdfMarca: a.pdfMarca,
  });
  return {
    nomePasta:       a.nomePasta,
    caminhoRelativo: a.caminhoRelativo,
    nome:            a.nome,
    tipo:            tipoDoDistrato(subpastaDe(a.caminhoRelativo), a.nome),
    assinatura,
    dataFim:         leitura?.dataFim ?? null,
    dataDocumento:   leitura?.dataDocumento ?? null,
    modificadoEm:    a.modificadoEm,
  };
}

/** Data do distrato para comparar com o contrato: a do texto; sem ela, a do arquivo. */
export function dataDoDistrato(d: DocumentoDistrato): string {
  return d.dataDocumento ?? d.dataFim ?? d.modificadoEm.toISOString().slice(0, 10);
}

const assinado = (d: DocumentoDistrato) => d.assinatura === 'digital' || d.assinatura === 'pelo_nome';

/** Assinado antes de não assinado; depois o mais recente. */
function melhor(docs: DocumentoDistrato[]): DocumentoDistrato | null {
  return [...docs].sort((a, b) =>
    Number(assinado(b)) - Number(assinado(a))
    || dataDoDistrato(b).localeCompare(dataDoDistrato(a))
    || b.modificadoEm.getTime() - a.modificadoEm.getTime())[0] ?? null;
}

/**
 * @param contratoMaisNovoEm data (AAAA-MM-DD) do contrato de prestação de serviços mais
 *        recente da empresa, ou null. Mais novo que o distrato = o cliente voltou.
 */
export function analisarDistratos(docs: DocumentoDistrato[], contratoMaisNovoEm: string | null): ResultadoDistrato | null {
  if (!docs.length) return null;
  const avisos = docs.filter((d) => d.tipo !== 'contabil');
  const escolhido = melhor(docs.filter((d) => d.tipo === 'contabil'));

  if (escolhido && contratoMaisNovoEm && contratoMaisNovoEm > dataDoDistrato(escolhido)) {
    return { efetivo: null, desconsiderado: { documento: escolhido, contratoMaisNovoEm }, avisos };
  }
  return { efetivo: escolhido, desconsiderado: null, avisos };
}

/** Mesmo formato para as três telas. */
export interface DistratoDTO {
  efetivo:        DocumentoDistratoDTO | null;
  desconsiderado: { documento: DocumentoDistratoDTO; contratoMaisNovoEm: string } | null;
  avisos:         DocumentoDistratoDTO[];
}

export interface DocumentoDistratoDTO {
  nomePasta:       string;
  caminhoRelativo: string;
  nome:            string;
  tipo:            TipoDistrato;
  assinado:        boolean;
  assinatura:      SinalAssinatura;
  dataFim:         string | null;
  dataDocumento:   string | null;
}

function paraDTODoc(d: DocumentoDistrato): DocumentoDistratoDTO {
  return {
    nomePasta: d.nomePasta, caminhoRelativo: d.caminhoRelativo, nome: d.nome, tipo: d.tipo,
    assinado: assinado(d), assinatura: d.assinatura, dataFim: d.dataFim, dataDocumento: d.dataDocumento,
  };
}

export function paraDistratoDTO(r: ResultadoDistrato | null): DistratoDTO | null {
  if (!r) return null;
  return {
    efetivo:        r.efetivo ? paraDTODoc(r.efetivo) : null,
    desconsiderado: r.desconsiderado
      ? { documento: paraDTODoc(r.desconsiderado.documento), contratoMaisNovoEm: r.desconsiderado.contratoMaisNovoEm }
      : null,
    avisos:         r.avisos.map(paraDTODoc),
  };
}

const dataBr = (iso: string | null) => (iso ? iso.split('-').reverse().join('/') : '');

/** Uma linha para planilha: o distrato que vale, o desconsiderado e os avisos. */
export function textoDoDistrato(d: DistratoDTO | null): string {
  if (!d) return '';
  const partes: string[] = [];
  if (d.efetivo) {
    partes.push(`Distrato${d.efetivo.dataFim ? ` (serviços até ${dataBr(d.efetivo.dataFim)})` : ''}${d.efetivo.assinado ? ', assinado' : ', sem assinatura'}`);
  }
  if (d.desconsiderado) {
    partes.push(`Distrato desconsiderado: contrato mais novo em ${dataBr(d.desconsiderado.contratoMaisNovoEm)}`);
  }
  for (const a of d.avisos) partes.push(a.tipo === 'bpo' ? 'Distrato do BPO' : 'Distrato social (dissolução)');
  return partes.join('; ');
}
