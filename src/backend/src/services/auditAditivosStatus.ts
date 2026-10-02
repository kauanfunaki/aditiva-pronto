// Auditoria Aditivos (Fase 2A) — status por empresa. Regras puras, sem banco.
//
// Decisões do Kauan em 01/10/2026 (docs/PLANO-AUDITORIA-CONTRATOS-ADITIVOS.md, seção 10),
// confirmadas pelo Societário em 02/10/2026:
//  3. "Em dia" = tem aditivo ANUAL do ANO DE REFERÊNCIA (parâmetro; a tela escolhe o ano).
//     O ano do arquivo vem do nome ou, sem ele, da data de modificação.
//  4. "ASS"/"ASSINADO" no nome, mesmo sem assinatura digital, CONTA como assinado
//     (status próprio ASSINADO_PELO_NOME, para dar para filtrar).
//  5. O aditivo anual vale para TODAS as empresas; o de 13º só para algumas. Por isso:
//     - 13º sozinho NÃO fecha a pendência do anual ("13º e Honorário" fecha);
//     - quando há 13º na pasta, a situação dele aparece à parte (assinado ou não);
//     - quando não há, não é pendência nenhuma.
// A decisão 6 (contrato de filial na pasta da filial ou da matriz) ainda está com o
// Societário: hoje cada empresa é avaliada só pelas pastas vinculadas a ela.

import {
  classificarAditivo,
  type ArquivoParaClassificar, type ClassificacaoAditivo,
} from './auditAditivosClassificador';

/** Do pior para o melhor. A ordem é usada para ordenar a tela. */
export const STATUS_ADITIVO = [
  'SEM_VINCULO',
  'SEM_PASTA_CONTRATO',
  'SEM_ADITIVO',
  'SO_DOCX',
  'PDF_SEM_ASSINATURA',
  'ASSINADO_PELO_NOME',
  'ASSINADO_DIGITAL',
  // Não sai de calcularStatusAditivo: o serviço aplica quando a empresa tem distrato (auditDistrato).
  'DISTRATO',
] as const;

export type StatusAditivo = (typeof STATUS_ADITIVO)[number];

/** Situação de um documento que existe na pasta (o anual ou o de 13º). */
export type SituacaoDocumento = Extract<StatusAditivo, 'SO_DOCX' | 'PDF_SEM_ASSINATURA' | 'ASSINADO_PELO_NOME' | 'ASSINADO_DIGITAL'>;

/** Decisão 4: assinado pelo nome conta como em dia. */
export const STATUS_EM_DIA: ReadonlySet<StatusAditivo> = new Set(['ASSINADO_DIGITAL', 'ASSINADO_PELO_NOME']);

export interface PastaDaEmpresa {
  nomePasta:         string;
  subpastasContrato: string[];
  arquivos:          ArquivoParaClassificar[];
}

export interface ArquivoClassificado extends ArquivoParaClassificar {
  nomePasta:     string;
  classificacao: ClassificacaoAditivo;
}

export interface SituacaoDecimoTerceiro {
  situacao: SituacaoDocumento;
  assinado: boolean;
  arquivos: ArquivoClassificado[];
}

export interface ResultadoStatusAditivo {
  status:              StatusAditivo;
  emDia:               boolean;
  /** Aditivos anuais que valem para o ano de referência (os que fecham a pendência). */
  aditivosDoAno:       ArquivoClassificado[];
  /** Os demais aditivos achados: de outros anos (anuais ou de 13º). */
  outrosAditivos:      ArquivoClassificado[];
  ultimoAnoComAditivo: number | null;
  /**
   * Termo de 13º do ano de referência, quando existe na pasta (decisão 5).
   * null = a empresa não tem 13º nesse ano, o que não é pendência.
   */
  decimoTerceiro:      SituacaoDecimoTerceiro | null;
}

/** Decisão 5: 13º sozinho não vale como aditivo anual; "13º e Honorário" vale. */
export function valeComoAditivoAnual(c: ClassificacaoAditivo): boolean {
  return c.ehAditivo && (!c.decimoTerceiro || c.honorario);
}

/** A melhor evidência entre os arquivos de um mesmo documento: digital > pelo nome > PDF/imagem > só Word. */
export function situacaoDosArquivos(arquivos: ArquivoClassificado[]): SituacaoDocumento | null {
  if (!arquivos.length) return null;
  const sinais = new Set(arquivos.map((a) => a.classificacao.assinatura));
  if (sinais.has('digital'))   return 'ASSINADO_DIGITAL';
  if (sinais.has('pelo_nome')) return 'ASSINADO_PELO_NOME';
  if (arquivos.some((a) => a.classificacao.formato === 'pdf' || a.classificacao.formato === 'imagem')) {
    return 'PDF_SEM_ASSINATURA';
  }
  return 'SO_DOCX';
}

export function calcularStatusAditivo(
  pastas: PastaDaEmpresa[],
  anoReferencia: number,
): ResultadoStatusAditivo {
  const vazio = { aditivosDoAno: [], outrosAditivos: [], ultimoAnoComAditivo: null, decimoTerceiro: null };

  if (pastas.length === 0) return { status: 'SEM_VINCULO', emDia: false, ...vazio };
  if (!pastas.some((p) => p.subpastasContrato.length > 0)) {
    return { status: 'SEM_PASTA_CONTRATO', emDia: false, ...vazio };
  }

  const aditivos: ArquivoClassificado[] = pastas
    .flatMap((p) => p.arquivos.map((a) => ({ ...a, nomePasta: p.nomePasta, classificacao: classificarAditivo(a) })))
    .filter((a) => a.classificacao.ehAditivo);

  const doAno = aditivos.filter((a) => a.classificacao.ano === anoReferencia && valeComoAditivoAnual(a.classificacao));
  // 13º do ano, inclusive o "13º e Honorário" (que também conta como anual).
  const decimo = aditivos.filter((a) => a.classificacao.ano === anoReferencia && a.classificacao.decimoTerceiro);
  const outros = aditivos.filter((a) => !doAno.includes(a) && !decimo.includes(a));
  const anos   = aditivos.map((a) => a.classificacao.ano);

  const status: StatusAditivo = situacaoDosArquivos(doAno) ?? 'SEM_ADITIVO';
  const situacao13 = situacaoDosArquivos(decimo);

  return {
    status,
    emDia:               STATUS_EM_DIA.has(status),
    aditivosDoAno:       doAno,
    outrosAditivos:      outros,
    ultimoAnoComAditivo: anos.length ? Math.max(...anos) : null,
    decimoTerceiro:      situacao13
      ? { situacao: situacao13, assinado: STATUS_EM_DIA.has(situacao13), arquivos: decimo }
      : null,
  };
}
