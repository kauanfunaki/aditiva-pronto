// Auditoria Contratos (Fase 2B) — status puro por empresa.
//
// Decisões consolidadas até 02/10/2026:
// - estados simples para operação, com motivos diagnósticos separados;
// - "assinado" no nome conta como assinado, com motivo próprio para filtro;
// - data de modificação só desempata versões do mesmo contrato lógico;
// - grupos lógicos diferentes nunca são escolhidos automaticamente pela data.

import {
  classificarContrato,
  type ArquivoParaClassificarContrato,
  type ClassificacaoContrato,
} from './auditContratosClassificador';

export const STATUS_CONTRATO = [
  'NAO_LOCALIZADO',
  'MINUTA',
  'AGUARDANDO_ASSINATURA',
  'REVISAR',
  'ASSINADO',
] as const;

export type StatusContrato = (typeof STATUS_CONTRATO)[number];
export type MotivoStatusContrato =
  | 'SEM_VINCULO'
  | 'SEM_PASTA_CONTRATO'
  | 'SEM_CONTRATO_SERVICO'
  | 'MULTIPLOS_CONTRATOS_ATUAIS'
  | 'SOMENTE_CONTRATO_ANTIGO'
  | 'CONTRATO_ASSINADO_PELO_NOME'
  | 'ARQUIVO_NAO_IDENTIFICADO'
  | 'PDF_NAO_ANALISADO'
  | 'FORMATO_EXIGE_REVISAO'
  | 'CONTRATO_DIGITAL_ASSINADO'
  | 'PDF_SEM_ASSINATURA'
  | 'APENAS_MINUTA';

export interface PastaParaStatusContrato {
  nomePasta:         string;
  subpastasContrato: string[];
  arquivos:          ArquivoParaClassificarContrato[];
}

export interface ContratoClassificado extends ArquivoParaClassificarContrato {
  nomePasta:     string;
  classificacao: ClassificacaoContrato;
}

export interface GrupoContrato {
  identidade: string;
  antigo:     boolean;
  arquivos:   ContratoClassificado[];
}

export interface ResultadoStatusContrato {
  status:           StatusContrato;
  emDia:            boolean;
  motivo:           MotivoStatusContrato;
  contratos:        ContratoClassificado[];
  descartados:      ContratoClassificado[];
  gruposAtuais:     GrupoContrato[];
  gruposAntigos:    GrupoContrato[];
  contratoPrincipal: ContratoClassificado | null;
  warnings:         string[];
}

function base(
  status: StatusContrato,
  motivo: MotivoStatusContrato,
  parcial: Partial<ResultadoStatusContrato> = {},
): ResultadoStatusContrato {
  return {
    status,
    emDia: status === 'ASSINADO',
    motivo,
    contratos: [],
    descartados: [],
    gruposAtuais: [],
    gruposAntigos: [],
    contratoPrincipal: null,
    warnings: [],
    ...parcial,
  };
}

function agrupar(arquivos: ContratoClassificado[]): GrupoContrato[] {
  const mapa = new Map<string, ContratoClassificado[]>();
  for (const arquivo of arquivos) {
    const lista = mapa.get(arquivo.classificacao.identidade) ?? [];
    lista.push(arquivo);
    mapa.set(arquivo.classificacao.identidade, lista);
  }
  return [...mapa.entries()].map(([identidade, itens]) => ({
    identidade,
    antigo: itens.every((a) => a.classificacao.antigo),
    arquivos: itens.sort((a, b) => b.modificadoEm.getTime() - a.modificadoEm.getTime()),
  }));
}

function prioridade(a: ContratoClassificado): number {
  const c = a.classificacao;
  if (c.assinatura.digital) return 5;
  if (c.assinatura.peloNome || c.assinatura.contraditoria) return 4;
  if (c.formato === 'pdf') return 3;
  if (c.formato === 'imagem') return 2;
  if (c.formato === 'word') return 1;
  return 0;
}

/** Evidência mais forte vence; data só desempata arquivos da mesma identidade e prioridade. */
function principalDoGrupo(grupo: GrupoContrato): ContratoClassificado {
  return [...grupo.arquivos].sort((a, b) =>
    prioridade(b) - prioridade(a) || b.modificadoEm.getTime() - a.modificadoEm.getTime(),
  )[0];
}

function assinaturaDe(a: ContratoClassificado): 'digital' | 'nome' | null {
  if (a.classificacao.assinatura.digital) return 'digital';
  if (a.classificacao.assinatura.peloNome) return 'nome';
  return null;
}

function resultadoAssinado(
  grupos: GrupoContrato[],
  comum: Pick<ResultadoStatusContrato, 'contratos' | 'descartados' | 'gruposAtuais' | 'gruposAntigos'>,
  warnings: string[] = [],
): ResultadoStatusContrato | null {
  const gruposAssinados = grupos.filter((grupo) => grupo.arquivos.some((a) => assinaturaDe(a)));
  if (!gruposAssinados.length) return null;

  const temDigital = gruposAssinados.some((grupo) =>
    grupo.arquivos.some((a) => a.classificacao.assinatura.digital));
  // Só há seleção inequívoca quando a evidência assinada pertence a um único grupo.
  const contratoPrincipal = gruposAssinados.length === 1 ? principalDoGrupo(gruposAssinados[0]) : null;
  const contraditoria = gruposAssinados.some((grupo) =>
    grupo.arquivos.some((a) => a.classificacao.assinatura.contraditoria));

  return base('ASSINADO', temDigital ? 'CONTRATO_DIGITAL_ASSINADO' : 'CONTRATO_ASSINADO_PELO_NOME', {
    ...comum,
    contratoPrincipal,
    warnings: [
      ...warnings,
      ...(contraditoria ? ['Há assinatura digital, mas o nome também declara ausência de assinatura.'] : []),
      ...(!temDigital ? ['Assinatura aceita pela indicação no nome; não foi encontrada assinatura digital.'] : []),
    ],
  });
}

export function calcularStatusContrato(pastas: PastaParaStatusContrato[]): ResultadoStatusContrato {
  if (pastas.length === 0) return base('NAO_LOCALIZADO', 'SEM_VINCULO');
  if (!pastas.some((p) => p.subpastasContrato.length > 0)) {
    return base('NAO_LOCALIZADO', 'SEM_PASTA_CONTRATO');
  }

  const classificados: ContratoClassificado[] = pastas.flatMap((p) =>
    p.arquivos.map((arquivo) => ({
      ...arquivo,
      nomePasta: p.nomePasta,
      classificacao: classificarContrato(arquivo),
    })),
  );
  const contratos = classificados.filter((a) => a.classificacao.ehContratoServico);
  const descartados = classificados.filter((a) => !a.classificacao.ehContratoServico);
  if (!contratos.length) {
    const naoIdentificados = descartados.filter((a) =>
      a.classificacao.motivoExclusao === 'nao_parece_contrato' &&
      (a.classificacao.formato === 'pdf' || a.classificacao.formato === 'imagem'));
    if (naoIdentificados.length) {
      return base('REVISAR', 'ARQUIVO_NAO_IDENTIFICADO', {
        contratos,
        descartados,
        warnings: ['Há PDF ou imagem na subpasta de contrato cujo nome não permite classificação automática.'],
      });
    }
    return base('NAO_LOCALIZADO', 'SEM_CONTRATO_SERVICO', { contratos, descartados });
  }

  const grupos = agrupar(contratos);
  const gruposAtuais = grupos.filter((g) => !g.antigo);
  const gruposAntigos = grupos.filter((g) => g.antigo);
  const comum = { contratos, descartados, gruposAtuais, gruposAntigos };

  if (gruposAtuais.length > 1) {
    const assinado = resultadoAssinado(gruposAtuais, comum, [
      'Há contratos com identidades diferentes; os demais arquivos devem ser conferidos.',
    ]);
    if (assinado) return assinado;
    return base('REVISAR', 'MULTIPLOS_CONTRATOS_ATUAIS', {
      ...comum,
      warnings: ['Há contratos com identidades diferentes; a data não será usada para escolher entre eles.'],
    });
  }
  if (gruposAtuais.length === 0) {
    return base('REVISAR', 'SOMENTE_CONTRATO_ANTIGO', {
      ...comum,
      contratoPrincipal: gruposAntigos.length === 1 ? principalDoGrupo(gruposAntigos[0]) : null,
      warnings: ['Foram encontrados somente contratos marcados como antigos.'],
    });
  }

  const grupo = gruposAtuais[0];
  const principal = principalDoGrupo(grupo);
  const evidencias = grupo.arquivos.map((a) => a.classificacao);
  const parcial = { ...comum, contratoPrincipal: principal };

  const assinado = resultadoAssinado([grupo], comum);
  if (assinado) return assinado;
  if (evidencias.some((c) => c.formato === 'pdf' && !c.assinatura.tecnicaLida)) {
    return base('REVISAR', 'PDF_NAO_ANALISADO', {
      ...parcial,
      warnings: ['O coletor não conseguiu analisar tecnicamente ao menos um PDF.'],
    });
  }
  if (evidencias.some((c) => c.formato === 'imagem')) {
    return base('REVISAR', 'FORMATO_EXIGE_REVISAO', {
      ...parcial,
      warnings: ['Imagem encontrada; é necessária conferência visual para identificar assinatura física.'],
    });
  }
  if (evidencias.some((c) => c.formato === 'pdf' && !c.minuta)) {
    return base('AGUARDANDO_ASSINATURA', 'PDF_SEM_ASSINATURA', parcial);
  }
  if (evidencias.some((c) => c.formato === 'word' || c.minuta)) {
    return base('MINUTA', 'APENAS_MINUTA', parcial);
  }
  return base('REVISAR', 'FORMATO_EXIGE_REVISAO', parcial);
}
