// Auditoria — base comum: fila de sincronização, robô e vínculo pasta ↔ empresa.
// O robô só coleta; quem interpreta o inventário são os módulos (Contratos / Aditivos).

import { v4 as uuidv4 } from 'uuid';
import * as repo from '../repositories/auditRepository';
import type { AuditConfig, JobOrigem, JobRow, TipoVinculo } from '../repositories/auditRepository';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';
import { deveCriarJobAgendado } from './auditAgendamento';
import { normalizarNomePasta } from './auditNormalizacao';
import { MAX_ARQUIVOS_POR_LOTE, MAX_PASTAS_POR_LOTE, type Lote, type VincularPasta } from './auditPayload';
import {
  agruparPorNome, indexarEmpresas, sugerirEmpresas, vinculoAutomatico,
  type Sugestao,
} from './auditVinculo';

/** O robô consulta a cada ~15 s; sem contato por 2 min, a tela mostra "robô offline". */
export const ROBO_ONLINE_MS = 2 * 60_000;

// ── Formato da API (camelCase) ────────────────────────────────────

export interface JobDTO {
  id:                string;
  status:            repo.JobStatus;
  origem:            JobOrigem;
  solicitadoEm:      Date;
  iniciadoEm:        Date | null;
  concluidoEm:       Date | null;
  roboHost:          string | null;
  pastasTotal:       number | null;
  pastasRecebidas:   number;
  arquivosRecebidos: number;
  erro:              string | null;
}

export function paraJobDTO(j: JobRow): JobDTO {
  return {
    id:                j.id,
    status:            j.status,
    origem:            j.origem,
    solicitadoEm:      j.solicitado_em,
    iniciadoEm:        j.iniciado_em,
    concluidoEm:       j.concluido_em,
    roboHost:          j.robo_host,
    pastasTotal:       j.pastas_total,
    pastasRecebidas:   j.pastas_recebidas,
    arquivosRecebidos: j.arquivos_recebidos,
    erro:              j.erro,
  };
}

function ehChaveDuplicada(err: unknown): boolean {
  return (err as { code?: string }).code === 'ER_DUP_ENTRY';
}

// ── Tela ──────────────────────────────────────────────────────────

/**
 * Pede uma sincronização. Se já houver uma pendente ou rodando, devolve essa
 * (o índice único em `au_sync_jobs.ativo` impede duas ao mesmo tempo).
 */
export async function solicitarSincronizacao(
  origem: JobOrigem,
  agora = new Date(),
): Promise<{ job: JobDTO; criado: boolean }> {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const id = uuidv4();
    try {
      await repo.inserirJob(id, origem, agora);
      const job = await repo.buscarJob(id);
      if (job) return { job: paraJobDTO(job), criado: true };
    } catch (err) {
      if (!ehChaveDuplicada(err)) throw err;
      const ativo = await repo.buscarJobAtivo();
      if (ativo) return { job: paraJobDTO(ativo), criado: false };
      // O ativo terminou entre o INSERT e a consulta: tenta de novo.
    }
  }
  throw new AppError(409, 'Não foi possível criar a sincronização. Tente de novo.');
}

export interface StatusAuditoria {
  ativo:           JobDTO | null;
  ultimoConcluido: JobDTO | null;
  /** Preenchido só quando a tentativa mais recente terminou em erro. */
  ultimoErro:      JobDTO | null;
  robo: {
    host:    string;
    versao:  string | null;
    vistoEm: Date;
    online:  boolean;
  } | null;
}

export async function obterStatus(agora = new Date()): Promise<StatusAuditoria> {
  const [ativo, ultimoConcluido, ultimoFinalizado, hb] = await Promise.all([
    repo.buscarJobAtivo(),
    repo.buscarUltimoConcluido(),
    repo.buscarUltimoFinalizado(),
    repo.buscarUltimoHeartbeat(),
  ]);

  return {
    ativo:           ativo ? paraJobDTO(ativo) : null,
    ultimoConcluido: ultimoConcluido ? paraJobDTO(ultimoConcluido) : null,
    ultimoErro:      ultimoFinalizado?.status === 'erro' ? paraJobDTO(ultimoFinalizado) : null,
    robo: hb
      ? {
          host:    hb.host,
          versao:  hb.versao,
          vistoEm: hb.visto_em,
          online:  agora.getTime() - hb.visto_em.getTime() < ROBO_ONLINE_MS,
        }
      : null,
  };
}

// ── Robô ──────────────────────────────────────────────────────────

export interface TrabalhoParaRobo {
  job:     { id: string; origem: JobOrigem; retomada: boolean };
  config:  AuditConfig & { normalizacao: 'semAcentoMaiusculo' };
  limites: { maxPastasPorLote: number; maxArquivosPorLote: number };
}

/**
 * Chamado a cada consulta do robô. Também serve de sinal de vida, expira job
 * parado e cria a sincronização diária quando passa do horário.
 * Devolve null quando não há nada a fazer.
 */
export async function proximoTrabalho(
  host: string,
  versao: string | null,
  agora = new Date(),
): Promise<TrabalhoParaRobo | null> {
  await repo.registrarHeartbeat(host, versao, agora);

  const expirados = await repo.expirarJobsParados(agora);
  if (expirados) logger.warn(`[audit] ${expirados} job(s) expirado(s) por inatividade`);

  const config = await repo.obterConfig();
  const montar = (j: JobRow, retomada: boolean): TrabalhoParaRobo => ({
    job:     { id: j.id, origem: j.origem, retomada },
    config:  { ...config, normalizacao: 'semAcentoMaiusculo' },
    limites: { maxPastasPorLote: MAX_PASTAS_POR_LOTE, maxArquivosPorLote: MAX_ARQUIVOS_POR_LOTE },
  });

  // Robô reiniciou no meio de uma varredura: devolve o mesmo job. Os lotes
  // são idempotentes por pasta, então recomeçar do zero não duplica nada.
  const meu = await repo.buscarJobExecutandoDoHost(host);
  if (meu) {
    logger.info(`[audit] retomando job ${meu.id} para ${host}`);
    return montar(meu, true);
  }

  if (deveCriarJobAgendado(agora, config.horarioAgendado, await repo.buscarUltimaSolicitacao())) {
    const { job, criado } = await solicitarSincronizacao('agendado', agora);
    if (criado) logger.info(`[audit] sincronização agendada criada: ${job.id}`);
  }

  const pendente = await repo.buscarJobPendente();
  if (pendente && (await repo.reivindicarJob(pendente.id, host, agora))) {
    logger.info(`[audit] job ${pendente.id} entregue para ${host}`);
    return montar(pendente, false);
  }
  return null;
}

const MSG_JOB_INATIVO =
  'Este job não está mais em execução (expirou, falhou ou já foi concluído). Pare a varredura.';

export async function receberLote(jobId: string, lote: Lote, agora = new Date()): Promise<void> {
  const r = await repo.gravarLote(jobId, lote, agora);
  if (r === 'job_inativo') throw new AppError(409, MSG_JOB_INATIVO);
}

export async function concluir(
  jobId: string,
  totais: { pastas: number; arquivos: number },
  agora = new Date(),
): Promise<{ vinculosAutomaticos: number }> {
  const r = await repo.concluirJob(jobId, totais, agora);
  if (r.resultado === 'job_inativo') throw new AppError(409, MSG_JOB_INATIVO);
  if (r.resultado === 'divergente') {
    throw new AppError(
      422,
      `Totais não batem: chegaram ${r.recebido.pastas} de ${totais.pastas} pastas e ` +
      `${r.recebido.arquivos} de ${totais.arquivos} arquivos. O job foi marcado como erro.`,
    );
  }

  const vinculosAutomaticos = await aplicarVinculosAutomaticos(jobId, agora);
  const apagados = await repo.limparJobsAntigos(agora);
  logger.info(
    `[audit] job ${jobId} concluído — ${r.recebido.pastas} pastas, ${r.recebido.arquivos} arquivos, ` +
    `${vinculosAutomaticos} vínculo(s) automático(s), ${apagados} job(s) antigo(s) apagado(s)`,
  );
  return { vinculosAutomaticos };
}

export async function falhar(jobId: string, erro: string, agora = new Date()): Promise<void> {
  if (!(await repo.falharJob(jobId, erro, agora))) throw new AppError(409, MSG_JOB_INATIVO);
  logger.warn(`[audit] robô reportou falha no job ${jobId}: ${erro}`);
}

// ── Vínculo pasta ↔ empresa ───────────────────────────────────────

/** Liga sozinho as pastas novas cujo nome bate com exatamente uma empresa ativa. */
export async function aplicarVinculosAutomaticos(jobId: string, agora = new Date()): Promise<number> {
  const [pastas, vinculos, empresas] = await Promise.all([
    repo.listarPastasDoJob(jobId),
    repo.listarVinculos(),
    repo.listarEmpresas(),
  ]);

  const jaTratadas = new Set(vinculos.map((v) => v.nome_pasta));
  const porNome = agruparPorNome(indexarEmpresas(
    empresas
      .filter((e) => !e.inativo)
      .map((e) => ({ id: e.id, razaoSocial: e.razao_social, cnpj: e.cnpj })),
  ));

  const novos = pastas
    .filter((p) => !jaTratadas.has(p.nome_pasta))
    .map((p) => ({ nomePasta: p.nome_pasta, companyId: vinculoAutomatico(p.nome_pasta, porNome) }))
    .filter((p): p is { nomePasta: string; companyId: string } => p.companyId !== null);

  await repo.inserirVinculosAutomaticos(novos, agora);
  return novos.length;
}

export interface EmpresaResumo {
  id:          string;
  razaoSocial: string;
  cnpj:        string;
  inativo:     boolean;
}

export interface PastaAuditada {
  nomePasta:         string;
  subpastasContrato: string[];
  arquivos:          number;
  erro:              string | null;
  vinculo: {
    tipo:    TipoVinculo;
    /** null em pasta ignorada, ou se a empresa vinculada sumiu do cadastro. */
    empresa: EmpresaResumo | null;
  } | null;
  sugestoes: Sugestao[];
}

export interface ListaDePastas {
  job: JobDTO | null;
  resumo: {
    pastas:                 number;
    comSubpastaContrato:    number;
    automaticas:            number;
    confirmadas:            number;
    ignoradas:              number;
    semVinculo:             number;
    empresasAtivas:         number;
    empresasAtivasSemPasta: number;
  };
  pastas: PastaAuditada[];
}

/** Pastas da última sincronização concluída, com vínculo e sugestões. */
export async function listarPastas(): Promise<ListaDePastas> {
  const vazio: ListaDePastas = {
    job: null,
    resumo: {
      pastas: 0, comSubpastaContrato: 0, automaticas: 0, confirmadas: 0,
      ignoradas: 0, semVinculo: 0, empresasAtivas: 0, empresasAtivasSemPasta: 0,
    },
    pastas: [],
  };

  const ultimo = await repo.buscarUltimoConcluido();
  if (!ultimo) return vazio;

  const [pastas, vinculos, empresas] = await Promise.all([
    repo.listarPastasDoJob(ultimo.id),
    repo.listarVinculos(),
    repo.listarEmpresas(),
  ]);

  const empresaPorId = new Map<string, EmpresaResumo>(
    empresas.map((e) => [e.id, { id: e.id, razaoSocial: e.razao_social, cnpj: e.cnpj, inativo: !!e.inativo }]),
  );
  const ativas = empresas.filter((e) => !e.inativo);
  const ativasIndexadas = indexarEmpresas(
    ativas.map((e) => ({ id: e.id, razaoSocial: e.razao_social, cnpj: e.cnpj })),
  );
  const vinculoPorPasta = new Map(vinculos.map((v) => [v.nome_pasta, v]));

  const resultado: PastaAuditada[] = pastas.map((p) => {
    const v = vinculoPorPasta.get(p.nome_pasta);
    return {
      nomePasta:         p.nome_pasta,
      subpastasContrato: Array.isArray(p.subpastas_contrato) ? p.subpastas_contrato : [],
      arquivos:          p.arquivos,
      erro:              p.erro,
      vinculo: v
        ? { tipo: v.tipo, empresa: v.company_id ? empresaPorId.get(v.company_id) ?? null : null }
        : null,
      sugestoes: v ? [] : sugerirEmpresas(p.nome_pasta, ativasIndexadas),
    };
  });
  resultado.sort((a, b) => a.nomePasta.localeCompare(b.nomePasta, 'pt-BR', { sensitivity: 'base' }));

  const empresasComPasta = new Set(
    resultado
      .filter((p) => p.vinculo && p.vinculo.tipo !== 'ignorado' && p.vinculo.empresa)
      .map((p) => p.vinculo!.empresa!.id),
  );

  return {
    job: paraJobDTO(ultimo),
    resumo: {
      pastas:                 resultado.length,
      comSubpastaContrato:    resultado.filter((p) => p.subpastasContrato.length > 0).length,
      automaticas:            resultado.filter((p) => p.vinculo?.tipo === 'auto').length,
      confirmadas:            resultado.filter((p) => p.vinculo?.tipo === 'confirmado').length,
      ignoradas:              resultado.filter((p) => p.vinculo?.tipo === 'ignorado').length,
      semVinculo:             resultado.filter((p) => !p.vinculo).length,
      empresasAtivas:         ativas.length,
      empresasAtivasSemPasta: ativas.filter((e) => !empresasComPasta.has(e.id)).length,
    },
    pastas: resultado,
  };
}

export async function alterarVinculo(input: VincularPasta, agora = new Date()): Promise<void> {
  const nomePasta = normalizarNomePasta(input.nomePasta);
  switch (input.acao) {
    case 'vincular':
      if (!(await repo.empresaExiste(input.companyId))) {
        throw new AppError(404, 'Empresa não encontrada.');
      }
      await repo.salvarVinculo(nomePasta, input.companyId, 'confirmado', agora);
      return;
    case 'ignorar':
      await repo.salvarVinculo(nomePasta, null, 'ignorado', agora);
      return;
    case 'desfazer':
      await repo.removerVinculo(nomePasta);
      return;
  }
}
