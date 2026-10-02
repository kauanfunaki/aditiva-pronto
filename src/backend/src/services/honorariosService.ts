// Honorários: valor do documento mais recente por empresa, comparado com o Acessórias.
// Dados: inventário da última sincronização + texto lido pelo robô (au_textos) + valor
// informado à mão + última leitura do Acessórias + envios.

import { AppError } from '../middleware/errorHandler';
import * as base from '../repositories/auditRepository';
import * as aditivosRepo from '../repositories/auditAditivosRepository';
import * as textosRepo from '../repositories/auditTextosRepository';
import * as repo from '../repositories/honorariosRepository';
import { classificarAditivo } from './auditAditivosClassificador';
import { atualizarLeiturasAntigas, chaveDoArquivo, EXTENSOES_COM_TEXTO, mesmaVersao } from './auditTextosService';
import { paraJobDTO, type JobDTO } from './auditSyncService';
import { tipoDoDocumento, type FormaLeitura, type TipoDocumento } from './honorarioLeitor';
import {
  compararComAcessorias, escolherHonorario, minutaPeloNome, situacaoDoHonorario, SITUACOES_HONORARIO,
  type AlertaHonorario, type ComparacaoAcessorias, type DocumentoDaEmpresa, type EstadoTexto,
  type SituacaoHonorario,
} from './honorariosRegras';

const IMAGENS = new Set(['.jpg', '.jpeg', '.jfif', '.png', '.tif', '.tiff', '.bmp', '.heic']);

export const soDigitos = (s: string) => s.replace(/\D/g, '');

export interface DocumentoResumo {
  nomePasta:       string;
  caminhoRelativo: string;
  nome:            string;
  tipo:            TipoDocumento;
  data:            string | null;
  modificadoEm:    Date;
  estado:          EstadoTexto;
  assinatura:      string;
  minuta:          boolean;
  valor:           number | null;
  adicional:       number | null;
  forma:           FormaLeitura | null;
  trecho:          string | null;
}

export interface EmpresaHonorario {
  empresa:   { id: string; razaoSocial: string; cnpj: string; responsavel: string | null };
  situacao:  SituacaoHonorario;
  alertas:   AlertaHonorario[];
  /** Valor que vai para o Acessórias (o informado à mão vence o lido). */
  valor:     number | null;
  fonte:     'manual' | 'documento' | null;
  documento: DocumentoResumo | null;
  manual:    { valor: number; documento: string | null; observacao: string | null; informadoPor: string; informadoEm: Date } | null;
  documentos: DocumentoResumo[];
  acessorias: {
    comparacao:    ComparacaoAcessorias;
    valor:         number | null;
    identificador: string | null;
    situacao:      string | null;
  };
  ultimoEnvio: { enviadoEm: Date; conta: string; valorEnviado: number; status: 'ok' | 'erro'; erro: string | null } | null;
}

export interface RelatorioHonorarios {
  job:     JobDTO | null;
  raizUnc: string;
  resumo: {
    empresas:    number;
    porSituacao: Record<SituacaoHonorario, number>;
    comValor:    number;
    textos:      { documentos: number; lidos: number; pendentes: number; semTexto: number };
    acessorias:  { conferidoEm: Date | null; iguais: number; diferentes: number; naoEncontradas: number };
  };
  empresas: EmpresaHonorario[];
}

const numero = (v: string | null | undefined) => (v === null || v === undefined ? null : Number(v));

function resumirDocumento(d: DocumentoDaEmpresa): DocumentoResumo {
  return {
    nomePasta: d.nomePasta, caminhoRelativo: d.caminhoRelativo, nome: d.nome, tipo: d.tipo, data: d.data,
    modificadoEm: d.modificadoEm, estado: d.estado, assinatura: d.assinatura, minuta: d.minuta,
    valor: d.valor, adicional: d.adicional, forma: d.forma, trecho: d.trecho,
  };
}

const porSituacaoZerado = () =>
  Object.fromEntries(SITUACOES_HONORARIO.map((s) => [s, 0])) as Record<SituacaoHonorario, number>;

export async function montarRelatorioHonorarios(): Promise<RelatorioHonorarios> {
  await atualizarLeiturasAntigas();

  const [ultimo, config] = await Promise.all([base.buscarUltimoConcluido(), base.obterConfig()]);
  const vazio: RelatorioHonorarios = {
    job: null, raizUnc: config.raizUnc,
    resumo: {
      empresas: 0, porSituacao: porSituacaoZerado(), comValor: 0,
      textos: { documentos: 0, lidos: 0, pendentes: 0, semTexto: 0 },
      acessorias: { conferidoEm: null, iguais: 0, diferentes: 0, naoEncontradas: 0 },
    },
    empresas: [],
  };
  if (!ultimo) return vazio;

  const [pastas, vinculos, arquivos, ativas, marcas, leituras, manuais, acessorias, envios] = await Promise.all([
    base.listarPastasDoJob(ultimo.id),
    base.listarVinculos(),
    aditivosRepo.listarArquivosDoJob(ultimo.id),
    aditivosRepo.listarEmpresasAtivas(),
    base.listarMarcasSemPasta(),
    textosRepo.listarLeituras(),
    repo.listarManuais(),
    repo.listarAcessorias(),
    repo.ultimosEnviosPorEmpresa(),
  ]);

  const leituraPorChave = new Map(leituras.map((l) => [l.chave, l]));
  const pastasDoJob = new Set(pastas.map((p) => p.nome_pasta));
  const pastasPorEmpresa = new Map<string, string[]>();
  for (const v of vinculos) {
    if (v.tipo === 'ignorado' || !v.company_id || !pastasDoJob.has(v.nome_pasta)) continue;
    pastasPorEmpresa.set(v.company_id, [...(pastasPorEmpresa.get(v.company_id) ?? []), v.nome_pasta]);
  }

  // Documentos por pasta, já com o que o robô leu.
  const textos = { documentos: 0, lidos: 0, pendentes: 0, semTexto: 0 };
  const docsPorPasta = new Map<string, DocumentoDaEmpresa[]>();
  for (const a of arquivos) {
    const ext = a.ext.toLowerCase();
    const comTexto = EXTENSOES_COM_TEXTO.has(ext);
    if (!comTexto && !IMAGENS.has(ext)) continue;

    const modificadoEm = a.modificado_em;
    const classe = classificarAditivo({
      nome: a.nome, caminhoRelativo: a.caminho_relativo, ext: a.ext, modificadoEm,
      pdfAssinado: a.pdf_assinado === null ? null : !!a.pdf_assinado, pdfMarca: a.pdf_marca,
    });
    const doc: DocumentoDaEmpresa = {
      nomePasta: a.nome_pasta, caminhoRelativo: a.caminho_relativo, nome: a.nome, modificadoEm,
      estado: 'imagem', tipo: tipoDoDocumento('', a.nome), data: null, assinatura: classe.assinatura,
      minuta: minutaPeloNome(a.nome), valor: null, adicional: null, forma: null, condicional: false, trecho: null,
    };

    if (comTexto) {
      const l = leituraPorChave.get(chaveDoArquivo(a.nome_pasta, a.caminho_relativo));
      const valida = l && mesmaVersao({ modificadoEm, tamanho: Number(a.tamanho) }, l);
      if (!valida) doc.estado = 'pendente';
      else {
        doc.estado = l.status;
        if (l.status === 'ok') {
          doc.tipo = l.tipo_documento ?? doc.tipo;
          doc.data = l.data_documento;
          doc.valor = numero(l.honorario);
          doc.adicional = numero(l.adicional_funcionario);
          doc.forma = (l.forma_leitura as FormaLeitura | null) ?? null;
          doc.condicional = l.condicional === 1;
          doc.trecho = l.trecho;
        }
      }
    }
    docsPorPasta.set(a.nome_pasta, [...(docsPorPasta.get(a.nome_pasta) ?? []), doc]);
  }

  const manualPorEmpresa = new Map(manuais.map((m) => [m.company_id, m]));
  const acessoriasPorCnpj = new Map(acessorias.map((a) => [a.cnpj_digitos, a]));
  const conferido = acessorias.length > 0;
  const conferidoEm = conferido
    ? new Date(Math.max(...acessorias.map((a) => a.lido_em.getTime())))
    : null;
  const envioPorEmpresa = new Map(envios.map((e) => [e.company_id, e]));

  const marcadas = new Set(marcas.map((m) => m.company_id));
  const empresas = ativas.filter((e) => !(marcadas.has(e.id) && !pastasPorEmpresa.has(e.id)));

  const linhas: EmpresaHonorario[] = empresas.map((e) => {
    const docs = (pastasPorEmpresa.get(e.id) ?? []).flatMap((p) => docsPorPasta.get(p) ?? []);
    for (const d of docs) {
      if (d.estado === 'imagem') continue;
      textos.documentos++;
      if (d.estado === 'pendente') textos.pendentes++;
      else textos.lidos++;
      if (d.estado === 'sem_texto') textos.semTexto++;
    }

    const escolha = escolherHonorario(docs);
    const m = manualPorEmpresa.get(e.id);
    const { situacao, alertas } = situacaoDoHonorario(docs, escolha, !!m);
    const manual = m
      ? { valor: Number(m.valor), documento: m.documento, observacao: m.observacao, informadoPor: m.informado_por, informadoEm: m.informado_em }
      : null;
    const valor = manual?.valor ?? escolha.documento?.valor ?? null;

    const ac = acessoriasPorCnpj.get(soDigitos(e.cnpj)) ?? null;
    const env = envioPorEmpresa.get(e.id);

    return {
      empresa:   { id: e.id, razaoSocial: e.razao_social, cnpj: e.cnpj, responsavel: e.responsavel },
      situacao,
      alertas,
      valor,
      fonte:     manual ? 'manual' : escolha.documento ? 'documento' : null,
      documento: escolha.documento ? resumirDocumento(escolha.documento) : null,
      manual,
      documentos: [...docs].sort((a, b) => b.modificadoEm.getTime() - a.modificadoEm.getTime()).map(resumirDocumento),
      acessorias: {
        comparacao:    compararComAcessorias(valor, ac ? { honorario: numero(ac.honorario) } : null, conferido),
        valor:         ac ? numero(ac.honorario) : null,
        identificador: ac?.identificador ?? null,
        situacao:      ac?.situacao ?? null,
      },
      ultimoEnvio: env
        ? { enviadoEm: env.enviado_em, conta: env.conta, valorEnviado: Number(env.valor_enviado), status: env.status, erro: env.erro }
        : null,
    };
  });

  const ordem = new Map(SITUACOES_HONORARIO.map((s, i) => [s, i]));
  linhas.sort((a, b) =>
    ordem.get(a.situacao)! - ordem.get(b.situacao)! ||
    a.empresa.razaoSocial.localeCompare(b.empresa.razaoSocial, 'pt-BR'));

  const porSituacao = porSituacaoZerado();
  for (const l of linhas) porSituacao[l.situacao]++;

  return {
    job: paraJobDTO(ultimo),
    raizUnc: config.raizUnc,
    resumo: {
      empresas: linhas.length,
      porSituacao,
      comValor: linhas.filter((l) => l.valor !== null).length,
      textos,
      acessorias: {
        conferidoEm,
        iguais:         linhas.filter((l) => l.acessorias.comparacao === 'IGUAL').length,
        diferentes:     linhas.filter((l) => l.acessorias.comparacao === 'DIFERENTE').length,
        naoEncontradas: linhas.filter((l) => l.acessorias.comparacao === 'NAO_ENCONTRADA').length,
      },
    },
    empresas: linhas,
  };
}

// ── Valor informado à mão ─────────────────────────────────────────

export async function informarValor(conta: string, d: {
  companyId: string; valor: number; documento: string | null; observacao: string | null;
}): Promise<void> {
  if (!(await repo.empresaAtiva(d.companyId))) throw new AppError(404, 'Empresa não encontrada (ou inativa).');
  await repo.gravarManual({ ...d, conta, agora: new Date() });
}

export async function removerValorInformado(companyId: string): Promise<void> {
  await repo.apagarManual(companyId);
}
