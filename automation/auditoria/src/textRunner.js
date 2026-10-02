'use strict';

// Rodada de leitura de textos: pergunta ao app quais documentos ainda não têm texto,
// extrai e devolve. Roda a cada consulta à fila, depois do job (se houver), em lotes
// pequenos para o robô continuar atendendo o botão "Sincronizar" sem demora.

const { compilarRegex, mensagemErro } = require('./scanner');
const { extrairTexto, resolverCaminhoPermitido } = require('./textos');

/** Teto de cada envio ao app (o servidor aceita até 5 MB de JSON). */
const MAX_BYTES_ENVIO = 1_500_000;

async function processarTextos({ api, config, logger, signal }) {
  const pedido = await api.textosPendentes();
  if (!pedido || !Array.isArray(pedido.arquivos) || pedido.arquivos.length === 0) return { lidos: 0 };

  const regexSubpasta = compilarRegex(pedido.regexSubpastaContrato);
  const contagem = { ok: 0, sem_texto: 0, erro: 0 };
  let lote = [];
  let bytes = 0;

  const enviar = async () => {
    if (!lote.length) return;
    await api.enviarTextos(lote);
    lote = [];
    bytes = 0;
  };

  for (const arquivo of pedido.arquivos) {
    if (signal?.aborted) break;
    let resultado;
    try {
      const { caminho, ext } = resolverCaminhoPermitido({
        raizPermitida:   config.raizPermitida,
        raizUnc:         pedido.raizUnc,
        nomePasta:       arquivo.nomePasta,
        caminhoRelativo: arquivo.caminhoRelativo,
        regexSubpasta,
      });
      resultado = await extrairTexto(caminho, ext, {
        tamanhoEsperado:    arquivo.tamanho,
        modificadoEsperado: arquivo.modificadoEm,
      });
    } catch (err) {
      resultado = { status: 'erro', erro: mensagemErro(err).slice(0, 500) };
    }
    contagem[resultado.status]++;

    const item = {
      chave:        arquivo.chave,
      modificadoEm: arquivo.modificadoEm,
      tamanho:      arquivo.tamanho,
      status:       resultado.status,
      paginas:      resultado.paginas ?? null,
      texto:        resultado.texto ?? null,
      erro:         resultado.erro ?? null,
    };
    const tamanho = Buffer.byteLength(JSON.stringify(item));
    if (bytes + tamanho > MAX_BYTES_ENVIO) await enviar();
    lote.push(item);
    bytes += tamanho;
  }
  await enviar();

  const lidos = contagem.ok + contagem.sem_texto + contagem.erro;
  logger.info('Textos de documentos enviados.', { ...contagem, restantes: Math.max(0, (pedido.restantes ?? 0) - lidos) });
  return { lidos, ...contagem };
}

module.exports = { MAX_BYTES_ENVIO, processarTextos };
