// Auditoria Contratos (Fase 2B) — relatório por empresa e exportação XLSX.

import { utils, write } from 'xlsx';
import * as baseRepo from '../repositories/auditRepository';
import * as repo from '../repositories/auditContratosRepository';
import { paraJobDTO, type JobDTO } from './auditSyncService';
import type { ArquivoParaClassificarContrato } from './auditContratosClassificador';
import {
  calcularStatusContrato, STATUS_CONTRATO,
  type ContratoClassificado, type MotivoStatusContrato,
  type PastaParaStatusContrato, type StatusContrato,
} from './auditContratosStatus';
import { planejarRenomeacaoContrato, type PlanoRenomeacaoContrato } from './auditContratosRenomeacao';

export const ROTULO_STATUS_CONTRATO: Record<StatusContrato, string> = {
  NAO_LOCALIZADO:         'Não localizado',
  MINUTA:                 'Minuta',
  AGUARDANDO_ASSINATURA:  'Aguardando assinatura',
  REVISAR:                'Revisar',
  ASSINADO:               'Assinado',
};

export const ROTULO_MOTIVO_CONTRATO: Record<MotivoStatusContrato, string> = {
  SEM_VINCULO:                    'Sem pasta vinculada',
  SEM_PASTA_CONTRATO:             'Sem subpasta de contrato',
  SEM_CONTRATO_SERVICO:           'Contrato de prestação de serviços não localizado',
  MULTIPLOS_CONTRATOS_ATUAIS:     'Múltiplos contratos diferentes',
  SOMENTE_CONTRATO_ANTIGO:        'Somente contrato marcado como antigo',
  POSSIVEL_ASSINATURA_FISICA:     'Possível assinatura física — conferir documento',
  EVIDENCIA_CONTRADITORIA:        'Evidências de assinatura contraditórias',
  FORMATO_EXIGE_REVISAO:          'Formato exige conferência manual',
  CONTRATO_DIGITAL_ASSINADO:      'Assinatura digital detectada',
  PDF_SEM_ASSINATURA:             'PDF sem assinatura digital',
  APENAS_MINUTA:                  'Somente arquivo editável ou minuta',
};

export interface ArquivoContratoResumo {
  nomePasta:       string;
  caminhoRelativo: string;
  nome:            string;
  ext:             string;
  modificadoEm:    Date;
  formato:         string;
  antigo:          boolean;
  minuta:          boolean;
  assinatura:      { digital: boolean; peloNome: boolean; explicitamenteAusente: boolean; contraditoria: boolean };
  icp:             boolean;
  identidade:      string;
  motivos:         string[];
  motivoExclusao:  string | null;
}

export interface EmpresaContrato {
  empresa: { id: string; razaoSocial: string; cnpj: string; responsavel: string | null };
  status:            StatusContrato;
  emDia:             boolean;
  motivo:            MotivoStatusContrato;
  pastas:            { nomePasta: string; subpastasContrato: string[] }[];
  contratos:         ArquivoContratoResumo[];
  descartados:       ArquivoContratoResumo[];
  contratoPrincipal: ArquivoContratoResumo | null;
  warnings:          string[];
  renomeacao:        PlanoRenomeacaoContrato | null;
}

export interface RelatorioContratos {
  job:     JobDTO | null;
  raizUnc: string;
  resumo: {
    empresas:  number;
    emDia:     number;
    revisar:   number;
    /** Marcadas como "sem pasta na rede de propósito": ficam fora do relatório. */
    marcadasSemPasta: number;
    porStatus: Record<StatusContrato, number>;
  };
  empresas: EmpresaContrato[];
}

function resumirArquivo(a: ContratoClassificado): ArquivoContratoResumo {
  const c = a.classificacao;
  return {
    nomePasta:       a.nomePasta,
    caminhoRelativo: a.caminhoRelativo,
    nome:            a.nome,
    ext:             a.ext,
    modificadoEm:    a.modificadoEm,
    formato:         c.formato,
    antigo:          c.antigo,
    minuta:          c.minuta,
    assinatura:      c.assinatura,
    icp:             c.icp,
    identidade:      c.identidade,
    motivos:         c.motivos,
    motivoExclusao:  c.motivoExclusao,
  };
}

const porStatusZerado = () =>
  Object.fromEntries(STATUS_CONTRATO.map((s) => [s, 0])) as Record<StatusContrato, number>;

export async function montarRelatorioContratos(): Promise<RelatorioContratos> {
  const [ultimo, config] = await Promise.all([baseRepo.buscarUltimoConcluido(), baseRepo.obterConfig()]);
  const vazio: RelatorioContratos = {
    job: null,
    raizUnc: config.raizUnc,
    resumo: { empresas: 0, emDia: 0, revisar: 0, marcadasSemPasta: 0, porStatus: porStatusZerado() },
    empresas: [],
  };
  if (!ultimo) return vazio;

  const [pastas, vinculos, arquivos, todasAtivas, marcas] = await Promise.all([
    baseRepo.listarPastasDoJob(ultimo.id),
    baseRepo.listarVinculos(),
    repo.listarArquivosDoJob(ultimo.id),
    repo.listarEmpresasAtivas(),
    baseRepo.listarMarcasSemPasta(),
  ]);

  const arquivosPorPasta = new Map<string, ArquivoParaClassificarContrato[]>();
  for (const a of arquivos) {
    const lista = arquivosPorPasta.get(a.nome_pasta) ?? [];
    lista.push({
      nome:            a.nome,
      caminhoRelativo: a.caminho_relativo,
      ext:             a.ext,
      modificadoEm:    a.modificado_em,
      pdfAssinado:     a.pdf_assinado === null ? null : !!a.pdf_assinado,
      pdfMarca:        a.pdf_marca,
    });
    arquivosPorPasta.set(a.nome_pasta, lista);
  }

  const pastaPorNome = new Map(pastas.map((p) => [p.nome_pasta, p]));
  const pastasPorEmpresa = new Map<string, PastaParaStatusContrato[]>();
  for (const vinculo of vinculos) {
    if (vinculo.tipo === 'ignorado' || !vinculo.company_id) continue;
    const pasta = pastaPorNome.get(vinculo.nome_pasta);
    if (!pasta) continue;
    const lista = pastasPorEmpresa.get(vinculo.company_id) ?? [];
    lista.push({
      nomePasta: pasta.nome_pasta,
      subpastasContrato: Array.isArray(pasta.subpastas_contrato) ? pasta.subpastas_contrato : [],
      arquivos: arquivosPorPasta.get(pasta.nome_pasta) ?? [],
    });
    pastasPorEmpresa.set(vinculo.company_id, lista);
  }

  // Segue a regra da Base: marcada como "sem pasta" e de fato sem vínculo fica
  // fora da auditoria. Se ganhar uma pasta depois, volta ao relatório normalmente.
  const marcadas = new Set(marcas.map((marca) => marca.company_id));
  const foraDaAuditoria = (id: string) => marcadas.has(id) && !pastasPorEmpresa.has(id);
  const empresas = todasAtivas.filter((empresa) => !foraDaAuditoria(empresa.id));

  const ordem = new Map(STATUS_CONTRATO.map((s, i) => [s, i]));
  const linhas: EmpresaContrato[] = empresas.map((empresa) => {
    const suasPastas = pastasPorEmpresa.get(empresa.id) ?? [];
    const resultado = calcularStatusContrato(suasPastas);
    const caminhos = suasPastas.flatMap((p) => p.arquivos.map((a) => a.caminhoRelativo));
    const renomeacao = resultado.status === 'ASSINADO' && resultado.contratoPrincipal
      ? planejarRenomeacaoContrato(resultado.contratoPrincipal, caminhos)
      : null;

    return {
      empresa: {
        id: empresa.id,
        razaoSocial: empresa.razao_social,
        cnpj: empresa.cnpj,
        responsavel: empresa.responsavel,
      },
      status: resultado.status,
      emDia: resultado.emDia,
      motivo: resultado.motivo,
      pastas: suasPastas.map((p) => ({ nomePasta: p.nomePasta, subpastasContrato: p.subpastasContrato })),
      contratos: resultado.contratos.map(resumirArquivo),
      descartados: resultado.descartados.map(resumirArquivo),
      contratoPrincipal: resultado.contratoPrincipal ? resumirArquivo(resultado.contratoPrincipal) : null,
      warnings: resultado.warnings,
      renomeacao,
    };
  });
  linhas.sort((a, b) =>
    ordem.get(a.status)! - ordem.get(b.status)! ||
    a.empresa.razaoSocial.localeCompare(b.empresa.razaoSocial, 'pt-BR'));

  const porStatus = porStatusZerado();
  for (const linha of linhas) porStatus[linha.status]++;
  return {
    job: paraJobDTO(ultimo),
    raizUnc: config.raizUnc,
    resumo: {
      empresas: linhas.length,
      emDia: linhas.filter((l) => l.emDia).length,
      revisar: linhas.filter((l) => l.status === 'REVISAR').length,
      marcadasSemPasta: todasAtivas.length - empresas.length,
      porStatus,
    },
    empresas: linhas,
  };
}

export interface FiltrosContratos {
  status?:      StatusContrato | 'em_dia' | 'pendente';
  responsavel?: string;
  busca?:       string;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrarEmpresasContratos(empresas: EmpresaContrato[], filtros: FiltrosContratos): EmpresaContrato[] {
  const termo = filtros.busca ? semAcento(filtros.busca.trim()) : '';
  const digitos = filtros.busca?.replace(/\D/g, '') ?? '';
  return empresas.filter((item) => {
    if (filtros.status === 'em_dia' && !item.emDia) return false;
    if (filtros.status === 'pendente' && item.emDia) return false;
    if (filtros.status && filtros.status !== 'em_dia' && filtros.status !== 'pendente' && item.status !== filtros.status) return false;
    if (filtros.responsavel === '__none__' && item.empresa.responsavel) return false;
    if (filtros.responsavel && filtros.responsavel !== '__none__' && item.empresa.responsavel !== filtros.responsavel) return false;
    if (termo) {
      const nome = semAcento(item.empresa.razaoSocial);
      const cnpj = item.empresa.cnpj.replace(/\D/g, '');
      const pasta = item.pastas.some((p) => semAcento(p.nomePasta).includes(termo));
      if (!nome.includes(termo) && !pasta && !(digitos.length >= 3 && cnpj.includes(digitos))) return false;
    }
    return true;
  });
}

export function gerarXlsxContratos(relatorio: RelatorioContratos, empresas: EmpresaContrato[]): Buffer {
  const cabecalho = [
    'Empresa', 'CNPJ', 'Responsável', 'Status', 'Motivo', 'Em dia',
    'Pasta(s) na rede', 'Contrato selecionado', 'Assinatura digital',
    'Possível assinatura física', 'Avisos', 'Renomeação (dry run)',
  ];
  const linhas = empresas.map((item) => [
    item.empresa.razaoSocial,
    item.empresa.cnpj,
    item.empresa.responsavel ?? '',
    ROTULO_STATUS_CONTRATO[item.status],
    ROTULO_MOTIVO_CONTRATO[item.motivo],
    item.emDia ? 'Sim' : 'Não',
    item.pastas.map((p) => p.nomePasta).join('; '),
    item.contratoPrincipal?.nome ?? '',
    item.contratoPrincipal?.assinatura.digital ? 'Sim' : 'Não',
    item.motivo === 'POSSIVEL_ASSINATURA_FISICA' ? 'Revisar' : '',
    item.warnings.join('; '),
    item.renomeacao?.recomendado ? item.renomeacao.caminhoDestino ?? '' : '',
  ]);
  const ws = utils.aoa_to_sheet([cabecalho, ...linhas]);
  ws['!cols'] = cabecalho.map((titulo, i) => ({
    wch: Math.min(Math.max(titulo.length, ...linhas.map((l) => String(l[i] ?? '').length)) + 2, 60),
  }));
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, 'Contratos');
  return Buffer.from(write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
