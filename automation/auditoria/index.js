'use strict';

const { carregarConfig } = require('./src/config');
const { criarApiClient } = require('./src/apiClient');
const { executarServico } = require('./src/service');
const { criarLogger } = require('./src/logger');

async function main() {
  const config = carregarConfig();
  const logger = criarLogger(config.logLevel);
  const api = criarApiClient(config, logger);
  const controller = new AbortController();

  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      logger.info('Encerramento solicitado; finalizando com segurança.');
      controller.abort();
    });
  }

  logger.info('Robô de auditoria iniciado.', {
    host: config.host,
    versao: config.versao,
    api: config.apiBaseUrl,
    modo: config.executarUmaVez ? 'uma_consulta' : 'servico',
  });

  await executarServico({ api, config, logger, signal: controller.signal });
}

main().catch((err) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`${new Date().toISOString()} ERROR Falha fatal: ${message}`);
  process.exitCode = 1;
});
