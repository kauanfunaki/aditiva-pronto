'use strict';

const { criarAcumuladorLotes } = require('./batches');
const { compilarRegex, listarPastasRaiz, mensagemErro, varrerPasta } = require('./scanner');
const { ApiError, JobInativoError } = require('./apiClient');

async function reportarFalha(api, jobId, err, logger) {
  const erro = mensagemErro(err);
  try {
    await api.falhar(jobId, erro);
  } catch (falha) {
    if (!(falha instanceof JobInativoError)) {
      logger.error('Não foi possível registrar a falha do job na API.', { erro: mensagemErro(falha) });
    }
  }
}

async function executarJob({ api, trabalho, logger, signal }) {
  const { job, config, limites } = trabalho;
  logger.info(job.retomada ? 'Retomando job desde o início.' : 'Job recebido.', { jobId: job.id, origem: job.origem });

  try {
    if (signal?.aborted) throw new Error('Operação cancelada.');
    if (config.normalizacao !== 'semAcentoMaiusculo') {
      throw new Error(`Normalização não suportada pelo robô: ${config.normalizacao}`);
    }

    const regex = compilarRegex(config.regexSubpastaContrato);
    const nomes = await listarPastasRaiz(config);
    const acumulador = criarAcumuladorLotes(limites);
    let pastasLidas = 0;
    let arquivosLidos = 0;
    let pastasEnviadas = 0;
    let numeroLote = 0;

    const enviar = async (pastas) => {
      if (signal?.aborted) throw new Error('Operação cancelada.');
      await api.enviarLote(job.id, { totalPastas: nomes.length, pastas });
      numeroLote++;
      pastasEnviadas += pastas.length;
      logger.info('Lote enviado.', { jobId: job.id, lote: numeroLote, pastasEnviadas, totalPastas: nomes.length });
    };

    logger.info('Pastas da raiz selecionadas.', { jobId: job.id, totalPastas: nomes.length });
    for (let i = 0; i < nomes.length; i++) {
      if (signal?.aborted) throw new Error('Operação cancelada.');
      const pasta = await varrerPasta(config.raizUnc, nomes[i], regex);
      pastasLidas++;
      arquivosLidos += pasta.arquivos.length;
      logger.debug('Pasta lida.', {
        jobId: job.id,
        pasta: pasta.nomePasta,
        arquivos: pasta.arquivos.length,
        erro: pasta.erro,
        progresso: `${i + 1}/${nomes.length}`,
      });
      for (const lote of acumulador.adicionar(pasta)) await enviar(lote);
    }
    for (const lote of acumulador.finalizar()) await enviar(lote);

    const totais = {
      pastas: pastasLidas,
      arquivos: arquivosLidos,
    };
    const resposta = await api.concluir(job.id, totais);
    logger.info('Job concluído.', { jobId: job.id, ...totais, vinculosAutomaticos: resposta.vinculosAutomaticos });
    return { resultado: 'concluido', totais };
  } catch (err) {
    if (err instanceof JobInativoError) {
      logger.warn('Job deixou de estar ativo; a varredura foi interrompida.', { jobId: job.id });
      return { resultado: 'inativo' };
    }
    if (err instanceof ApiError && err.status === 422) {
      logger.error('A API rejeitou os totais e marcou o job como erro.', { jobId: job.id, erro: err.message });
      return { resultado: 'erro', erro: err.message };
    }

    logger.error('Falha geral durante a varredura.', { jobId: job.id, erro: mensagemErro(err) });
    if (!signal?.aborted) await reportarFalha(api, job.id, err, logger);
    return { resultado: 'erro', erro: mensagemErro(err) };
  }
}

module.exports = { executarJob, reportarFalha };
