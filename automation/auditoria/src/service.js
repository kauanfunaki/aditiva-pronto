'use strict';

const { ApiError, esperar } = require('./apiClient');
const { executarJob } = require('./jobRunner');
const { mensagemErro } = require('./scanner');
const { processarTextos } = require('./textRunner');

async function executarServico({ api, config, logger, signal }) {
  while (!signal?.aborted) {
    try {
      const trabalho = await api.proximoJob();
      if (trabalho) await executarJob({ api, trabalho, logger, signal });
      else logger.debug('Nenhum job pendente.');
    } catch (err) {
      const status = err instanceof ApiError ? err.status : null;
      logger.error('Não foi possível consultar a API.', { status, erro: mensagemErro(err) });
    }

    // Leitura do texto dos documentos (honorário), um lote por rodada.
    if (!signal?.aborted) {
      try {
        await processarTextos({ api, config, logger, signal });
      } catch (err) {
        const status = err instanceof ApiError ? err.status : null;
        logger.error('Não foi possível processar os textos dos documentos.', { status, erro: mensagemErro(err) });
      }
    }

    if (config.executarUmaVez || signal?.aborted) return;
    try {
      await esperar(config.pollIntervalMs, signal);
    } catch {
      return;
    }
  }
}

module.exports = { executarServico };
