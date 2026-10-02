'use strict';

const NIVEIS = { debug: 10, info: 20, warn: 30, error: 40 };

function serializar(meta) {
  if (!meta || Object.keys(meta).length === 0) return '';
  return ` ${JSON.stringify(meta, (_key, value) => value instanceof Error ? value.message : value)}`;
}

function criarLogger(nivel = 'info') {
  const minimo = NIVEIS[nivel] ?? NIVEIS.info;
  const escrever = (nome, mensagem, meta) => {
    if (NIVEIS[nome] < minimo) return;
    const linha = `${new Date().toISOString()} ${nome.toUpperCase()} ${mensagem}${serializar(meta)}`;
    if (nome === 'error') console.error(linha);
    else if (nome === 'warn') console.warn(linha);
    else console.log(linha);
  };

  return {
    debug: (mensagem, meta) => escrever('debug', mensagem, meta),
    info: (mensagem, meta) => escrever('info', mensagem, meta),
    warn: (mensagem, meta) => escrever('warn', mensagem, meta),
    error: (mensagem, meta) => escrever('error', mensagem, meta),
  };
}

module.exports = { criarLogger };
