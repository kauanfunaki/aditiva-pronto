// Auditoria Aditivos (Fase 2A) — status por empresa. Regras puras, sem banco.
//
// Decisões do Kauan em 01/10/2026 (docs/PLANO-AUDITORIA-CONTRATOS-ADITIVOS.md, seção 10):
//  3. "Em dia" = tem aditivo do ANO DE REFERÊNCIA (parâmetro; a tela escolhe o ano).
//     O ano do arquivo vem do nome ou, sem ele, da data de modificação.
//  4. "ASS"/"ASSINADO" no nome sem assinatura embutida CONTA como assinado, mas com
//     status próprio (ASSINADO_PELO_NOME) para dar para filtrar.
//  5. Termo Aditivo de 13º sozinho NÃO fecha a pendência do aditivo anual;
//     "13º e Honorário" fecha.
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
] as const;

export type StatusAditivo = (typeof STATUS_ADITIVO)[number];

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

export interface ResultadoStatusAditivo {
  status:              StatusAditivo;
  emDia:               boolean;
  /** Aditivos que valem para o ano de referência (os que fecham a pendência). */
  aditivosDoAno:       ArquivoClassificado[];
  /** Os demais aditivos achados: de outros anos, ou 13º sozinho. */
  outrosAditivos:      ArquivoClassificado[];
  ultimoAnoComAditivo: number | null;
  /** Há 13º do ano de referência, que sozinho não fecha a pendência (decisão 5). */
  temDecimoTerceiroDoAno: boolean;
}

/** Decisão 5: 13º sozinho não vale como aditivo anual; "13º e Honorário" vale. */
export function valeComoAditivoAnual(c: ClassificacaoAditivo): boolean {
  return c.ehAditivo && (!c.decimoTerceiro || c.honorario);
}

export function calcularStatusAditivo(
  pastas: PastaDaEmpresa[],
  anoReferencia: number,
): ResultadoStatusAditivo {
  const vazio = { aditivosDoAno: [], outrosAditivos: [], ultimoAnoComAditivo: null, temDecimoTerceiroDoAno: false };

  if (pastas.length === 0) return { status: 'SEM_VINCULO', emDia: false, ...vazio };
  if (!pastas.some((p) => p.subpastasContrato.length > 0)) {
    return { status: 'SEM_PASTA_CONTRATO', emDia: false, ...vazio };
  }

  const aditivos: ArquivoClassificado[] = pastas
    .flatMap((p) => p.arquivos.map((a) => ({ ...a, nomePasta: p.nomePasta, classificacao: classificarAditivo(a) })))
    .filter((a) => a.classificacao.ehAditivo);

  const doAno  = aditivos.filter((a) => a.classificacao.ano === anoReferencia && valeComoAditivoAnual(a.classificacao));
  const outros = aditivos.filter((a) => !doAno.includes(a));
  const anos   = aditivos.map((a) => a.classificacao.ano);

  const sinais = new Set(doAno.map((a) => a.classificacao.assinatura));
  const status: StatusAditivo =
    doAno.length === 0                                                    ? 'SEM_ADITIVO'
    : sinais.has('digital')                                               ? 'ASSINADO_DIGITAL'
    : sinais.has('pelo_nome')                                             ? 'ASSINADO_PELO_NOME'
    : doAno.some((a) => ['pdf', 'imagem'].includes(a.classificacao.formato)) ? 'PDF_SEM_ASSINATURA'
    :                                                                       'SO_DOCX';

  return {
    status,
    emDia:                  STATUS_EM_DIA.has(status),
    aditivosDoAno:          doAno,
    outrosAditivos:         outros,
    ultimoAnoComAditivo:    anos.length ? Math.max(...anos) : null,
    temDecimoTerceiroDoAno: aditivos.some((a) =>
      a.classificacao.decimoTerceiro && !a.classificacao.honorario && a.classificacao.ano === anoReferencia),
  };
}
