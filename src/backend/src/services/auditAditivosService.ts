// Auditoria Aditivos (Fase 2A) — relatório por empresa e exportação XLSX.
// Lê a última sincronização concluída, aplica o classificador e a regra de status
// (auditAditivosStatus) e cruza com os termos gerados pelo próprio app.

import { utils, write } from 'xlsx';
import * as base from '../repositories/auditRepository';
import * as repo from '../repositories/auditAditivosRepository';
import { paraJobDTO, type JobDTO } from './auditSyncService';
import { classificarAditivo, type ArquivoParaClassificar } from './auditAditivosClassificador';
import {
  calcularStatusAditivo, STATUS_ADITIVO,
  type ArquivoClassificado, type PastaDaEmpresa, type StatusAditivo,
} from './auditAditivosStatus';

const FUSO = 'America/Sao_Paulo';

export const ROTULO_STATUS: Record<StatusAditivo, string> = {
  SEM_VINCULO:        'Sem pasta vinculada',
  SEM_PASTA_CONTRATO: 'Sem subpasta de contrato',
  SEM_ADITIVO:        'Sem aditivo do ano',
  SO_DOCX:            'Só o Word (não enviado)',
  PDF_SEM_ASSINATURA: 'PDF sem assinatura',
  ASSINADO_PELO_NOME: 'Assinado (pelo nome)',
  ASSINADO_DIGITAL:   'Assinado digitalmente',
};

export type AlertaAditivo = 'gerado_no_app_sem_arquivo';

export interface ArquivoResumo {
  nomePasta:       string;
  caminhoRelativo: string;
  nome:            string;
  formato:         string;
  assinatura:      string;
  icp:             boolean;
  decimoTerceiro:  boolean;
  honorario:       boolean;
  ano:             number;
  anoFonte:        'nome' | 'data_do_arquivo';
  modificadoEm:    Date;
}

export interface EmpresaAditivo {
  empresa: { id: string; razaoSocial: string; cnpj: string; responsavel: string | null };
  status:                 StatusAditivo;
  emDia:                  boolean;
  pastas:                 { nomePasta: string; subpastasContrato: string[] }[];
  aditivosDoAno:          ArquivoResumo[];
  outrosAditivos:         ArquivoResumo[];
  ultimoAnoComAditivo:    number | null;
  temDecimoTerceiroDoAno: boolean;
  geradosNoApp:           number;
  ultimoGeradoNoApp:      Date | null;
  alertas:                AlertaAditivo[];
}

export interface RelatorioAditivos {
  job:             JobDTO | null;
  anoReferencia:   number;
  anosDisponiveis: number[];
  raizUnc:         string;
  resumo: {
    empresas:              number;
    emDia:                 number;
    porStatus:             Record<StatusAditivo, number>;
    geradoNoAppSemArquivo: number;
    /** Marcadas como "sem pasta na rede de propósito": ficam fora do relatório. */
    marcadasSemPasta:      number;
  };
  empresas: EmpresaAditivo[];
}

export function anoAtual(agora = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: FUSO, year: 'numeric' }).format(agora));
}

/** Início do ano em São Paulo (UTC-3, sem horário de verão): 1º/jan 00:00 local = 03:00Z. */
const inicioDoAno = (ano: number) => new Date(Date.UTC(ano, 0, 1, 3, 0, 0));

function resumirArquivo(a: ArquivoClassificado): ArquivoResumo {
  const c = a.classificacao;
  return {
    nomePasta:       a.nomePasta,
    caminhoRelativo: a.caminhoRelativo,
    nome:            a.nome,
    formato:         c.formato,
    assinatura:      c.assinatura,
    icp:             c.icp,
    decimoTerceiro:  c.decimoTerceiro,
    honorario:       c.honorario,
    ano:             c.ano,
    anoFonte:        c.anoFonte,
    modificadoEm:    a.modificadoEm,
  };
}

const porStatusZerado = () =>
  Object.fromEntries(STATUS_ADITIVO.map((s) => [s, 0])) as Record<StatusAditivo, number>;

export async function montarRelatorioAditivos(anoReferencia: number): Promise<RelatorioAditivos> {
  const [ultimo, config] = await Promise.all([base.buscarUltimoConcluido(), base.obterConfig()]);
  const vazio: RelatorioAditivos = {
    job: null, anoReferencia, anosDisponiveis: [anoReferencia], raizUnc: config.raizUnc,
    resumo: { empresas: 0, emDia: 0, porStatus: porStatusZerado(), geradoNoAppSemArquivo: 0, marcadasSemPasta: 0 },
    empresas: [],
  };
  if (!ultimo) return vazio;

  const [pastas, vinculos, arquivos, todasAtivas, gerados, marcas] = await Promise.all([
    base.listarPastasDoJob(ultimo.id),
    base.listarVinculos(),
    repo.listarArquivosDoJob(ultimo.id),
    repo.listarEmpresasAtivas(),
    repo.contarGeradosNoApp(inicioDoAno(anoReferencia), inicioDoAno(anoReferencia + 1)),
    base.listarMarcasSemPasta(),
  ]);

  // Arquivos agrupados por pasta.
  const arquivosPorPasta = new Map<string, ArquivoParaClassificar[]>();
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

  // Pastas da última sincronização agrupadas pela empresa vinculada.
  const pastaPorNome = new Map(pastas.map((p) => [p.nome_pasta, p]));
  const pastasPorEmpresa = new Map<string, PastaDaEmpresa[]>();
  for (const v of vinculos) {
    if (v.tipo === 'ignorado' || !v.company_id) continue;
    const p = pastaPorNome.get(v.nome_pasta);
    if (!p) continue; // vínculo de pasta que não apareceu na última varredura
    const lista = pastasPorEmpresa.get(v.company_id) ?? [];
    lista.push({
      nomePasta:         p.nome_pasta,
      subpastasContrato: Array.isArray(p.subpastas_contrato) ? p.subpastas_contrato : [],
      arquivos:          arquivosPorPasta.get(p.nome_pasta) ?? [],
    });
    pastasPorEmpresa.set(v.company_id, lista);
  }

  // Marcada como "sem pasta" e de fato sem pasta vinculada: fora da auditoria.
  // Se ganhou pasta depois, volta a ser avaliada normalmente.
  const marcadas = new Set(marcas.map((m) => m.company_id));
  const foraDaAuditoria = (id: string) => marcadas.has(id) && !pastasPorEmpresa.has(id);
  const empresas = todasAtivas.filter((e) => !foraDaAuditoria(e.id));

  const ordem = new Map(STATUS_ADITIVO.map((s, i) => [s, i]));
  const linhas: EmpresaAditivo[] = empresas.map((e) => {
    const suas = pastasPorEmpresa.get(e.id) ?? [];
    const r = calcularStatusAditivo(suas, anoReferencia);
    const g = gerados.get(e.id);
    const alertas: AlertaAditivo[] = [];
    if (g && r.aditivosDoAno.length === 0) alertas.push('gerado_no_app_sem_arquivo');

    return {
      empresa:                { id: e.id, razaoSocial: e.razao_social, cnpj: e.cnpj, responsavel: e.responsavel },
      status:                 r.status,
      emDia:                  r.emDia,
      pastas:                 suas.map((p) => ({ nomePasta: p.nomePasta, subpastasContrato: p.subpastasContrato })),
      aditivosDoAno:          r.aditivosDoAno.map(resumirArquivo),
      outrosAditivos:         r.outrosAditivos.map(resumirArquivo),
      ultimoAnoComAditivo:    r.ultimoAnoComAditivo,
      temDecimoTerceiroDoAno: r.temDecimoTerceiroDoAno,
      geradosNoApp:           g?.qtd ?? 0,
      ultimoGeradoNoApp:      g?.ultimo ?? null,
      alertas,
    };
  });
  linhas.sort((a, b) =>
    ordem.get(a.status)! - ordem.get(b.status)! ||
    a.empresa.razaoSocial.localeCompare(b.empresa.razaoSocial, 'pt-BR'));

  // Anos que aparecem nos aditivos de qualquer pasta da varredura, para o seletor da tela.
  const anos = new Set<number>([anoReferencia, anoAtual()]);
  for (const lista of arquivosPorPasta.values()) {
    for (const a of lista) {
      const c = classificarAditivo(a);
      if (c.ehAditivo) anos.add(c.ano);
    }
  }

  const porStatus = porStatusZerado();
  for (const l of linhas) porStatus[l.status]++;

  return {
    job:             paraJobDTO(ultimo),
    anoReferencia,
    anosDisponiveis: [...anos].sort((a, b) => b - a),
    raizUnc:         config.raizUnc,
    resumo: {
      empresas:              linhas.length,
      emDia:                 linhas.filter((l) => l.emDia).length,
      porStatus,
      geradoNoAppSemArquivo: linhas.filter((l) => l.alertas.includes('gerado_no_app_sem_arquivo')).length,
      marcadasSemPasta:      todasAtivas.length - empresas.length,
    },
    empresas: linhas,
  };
}

// ── Filtros (tela e exportação usam os mesmos) ────────────────────

export interface FiltrosAditivos {
  status?:      StatusAditivo | 'em_dia' | 'pendente';
  /** undefined = todos · '__none__' = sem responsável · nome = só dele */
  responsavel?: string;
  busca?:       string;
  /** Só empresas com algum alerta (ex.: gerado no app, mas não está na pasta). */
  soAlerta?:    boolean;
}

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function filtrarEmpresas(empresas: EmpresaAditivo[], f: FiltrosAditivos): EmpresaAditivo[] {
  const termo = f.busca ? semAcento(f.busca.trim()) : '';
  const digitos = f.busca?.replace(/\D/g, '') ?? '';
  return empresas.filter((e) => {
    if (f.soAlerta && !e.alertas.length) return false;
    if (f.status === 'em_dia' && !e.emDia) return false;
    if (f.status === 'pendente' && e.emDia) return false;
    if (f.status && f.status !== 'em_dia' && f.status !== 'pendente' && e.status !== f.status) return false;
    if (f.responsavel === '__none__' && e.empresa.responsavel) return false;
    if (f.responsavel && f.responsavel !== '__none__' && e.empresa.responsavel !== f.responsavel) return false;
    if (termo) {
      const nome = semAcento(e.empresa.razaoSocial);
      const cnpj = e.empresa.cnpj.replace(/\D/g, '');
      const pasta = e.pastas.some((p) => semAcento(p.nomePasta).includes(termo));
      if (!nome.includes(termo) && !pasta && !(digitos.length >= 3 && cnpj.includes(digitos))) return false;
    }
    return true;
  });
}

// ── Exportação ────────────────────────────────────────────────────

const ROTULO_ASSINATURA: Record<string, string> = {
  digital:       'digital',
  pelo_nome:     'pelo nome',
  declarada_sem: 'sem assinatura (no nome)',
  nenhuma:       'sem assinatura',
  nao_se_aplica: 'Word',
};

export function gerarXlsxAditivos(rel: RelatorioAditivos, empresas: EmpresaAditivo[]): Buffer {
  const cabecalho = [
    'Empresa', 'CNPJ', 'Responsável', 'Status', 'Em dia',
    'Pasta(s) na rede', `Aditivos de ${rel.anoReferencia}`, 'Arquivos',
    'Último ano com aditivo', `Só 13º em ${rel.anoReferencia}`,
    `Gerados no app em ${rel.anoReferencia}`, 'Alerta',
  ];
  const linhas = empresas.map((e) => [
    e.empresa.razaoSocial,
    e.empresa.cnpj,
    e.empresa.responsavel ?? '',
    ROTULO_STATUS[e.status],
    e.emDia ? 'Sim' : 'Não',
    e.pastas.map((p) => p.nomePasta).join('; '),
    e.aditivosDoAno.length,
    e.aditivosDoAno.map((a) => `${a.nome} (${ROTULO_ASSINATURA[a.assinatura] ?? a.assinatura})`).join('; '),
    e.ultimoAnoComAditivo ?? '',
    e.temDecimoTerceiroDoAno && !e.emDia ? 'Sim' : '',
    e.geradosNoApp,
    e.alertas.includes('gerado_no_app_sem_arquivo') ? 'Gerado no app, mas não está na pasta' : '',
  ]);

  const ws = utils.aoa_to_sheet([cabecalho, ...linhas]);
  ws['!cols'] = cabecalho.map((_, i) => {
    const max = Math.max(cabecalho[i].length, ...linhas.map((l) => String(l[i] ?? '').length));
    return { wch: Math.min(max + 2, 60) };
  });
  const wb = utils.book_new();
  utils.book_append_sheet(wb, ws, `Aditivos ${rel.anoReferencia}`);
  return Buffer.from(write(wb, { type: 'buffer', bookType: 'xlsx' }));
}
