'use strict';

class ApiError extends Error {
  constructor(status, message, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

class JobInativoError extends ApiError {
  constructor(message, body) {
    super(409, message, body);
    this.name = 'JobInativoError';
  }
}

const esperar = (ms, signal) => new Promise((resolve, reject) => {
  if (signal?.aborted) {
    reject(signal.reason || new Error('Operação cancelada.'));
    return;
  }
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => {
    clearTimeout(timer);
    reject(signal.reason || new Error('Operação cancelada.'));
  }, { once: true });
});

function mensagemDoCorpo(body, status) {
  if (body && typeof body === 'object') {
    return body.error || body.message || `API respondeu HTTP ${status}.`;
  }
  return typeof body === 'string' && body.trim() ? body.trim() : `API respondeu HTTP ${status}.`;
}

function criarApiClient(config, logger) {
  async function requisitar(path, body, { permitir204 = false, tentativas = config.retryAttempts } = {}) {
    let ultimoErro;

    for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
      const timeout = new AbortController();
      const timer = setTimeout(() => timeout.abort(new Error('Tempo limite da requisição excedido.')), config.requestTimeoutMs);
      try {
        const response = await fetch(`${config.apiBaseUrl}${path}`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${config.token}`,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          body: JSON.stringify(body),
          signal: timeout.signal,
        });

        if (permitir204 && response.status === 204) return null;

        const tipo = response.headers.get('content-type') || '';
        const resposta = tipo.includes('application/json')
          ? await response.json()
          : await response.text();

        if (response.ok) return resposta;

        const mensagem = mensagemDoCorpo(resposta, response.status);
        if (response.status === 409) throw new JobInativoError(mensagem, resposta);

        const erro = new ApiError(response.status, mensagem, resposta);
        if (response.status < 500 && response.status !== 429) throw erro;
        ultimoErro = erro;
      } catch (err) {
        if (err instanceof JobInativoError) throw err;
        if (err instanceof ApiError && err.status < 500 && err.status !== 429) throw err;
        ultimoErro = err;
      } finally {
        clearTimeout(timer);
      }

      if (tentativa < tentativas) {
        const atraso = Math.min(1000 * (2 ** (tentativa - 1)), 10_000);
        logger.warn('Falha temporária ao chamar a API; nova tentativa.', { tentativa, atrasoMs: atraso });
        await esperar(atraso);
      }
    }

    throw ultimoErro instanceof Error ? ultimoErro : new Error(String(ultimoErro));
  }

  return {
    proximoJob: () => requisitar('/audit/robot/next-job', {
      host: config.host,
      versao: config.versao,
    }, { permitir204: true }),
    enviarLote: (jobId, lote) => requisitar(`/audit/robot/jobs/${encodeURIComponent(jobId)}/folders`, lote),
    concluir: (jobId, totais) => requisitar(`/audit/robot/jobs/${encodeURIComponent(jobId)}/finish`, { totais }),
    falhar: (jobId, erro) => requisitar(`/audit/robot/jobs/${encodeURIComponent(jobId)}/fail`, { erro }, { tentativas: 1 }),
    textosPendentes: () => requisitar('/audit/robot/texts/pending', {
      host: config.host,
      versao: config.versao,
    }, { permitir204: true }),
    enviarTextos: (textos) => requisitar('/audit/robot/texts', { textos }),
  };
}

module.exports = { ApiError, JobInativoError, criarApiClient, esperar };
