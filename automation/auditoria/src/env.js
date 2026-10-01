'use strict';

const fs = require('node:fs');
const path = require('node:path');

function removerAspas(valor) {
  if (valor.length >= 2) {
    const primeira = valor[0];
    const ultima = valor[valor.length - 1];
    if ((primeira === '"' && ultima === '"') || (primeira === "'" && ultima === "'")) {
      return valor.slice(1, -1);
    }
  }
  return valor;
}

/** Carrega um .env simples sem sobrescrever variáveis definidas pelo serviço do Windows. */
function carregarEnv(caminho = path.resolve(__dirname, '..', '.env')) {
  if (!fs.existsSync(caminho)) return;

  const conteudo = fs.readFileSync(caminho, 'utf8').replace(/^\uFEFF/, '');
  for (const linhaOriginal of conteudo.split(/\r?\n/)) {
    const linha = linhaOriginal.trim();
    if (!linha || linha.startsWith('#')) continue;

    const separador = linha.indexOf('=');
    if (separador <= 0) continue;

    const chave = linha.slice(0, separador).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(chave) || process.env[chave] !== undefined) continue;
    process.env[chave] = removerAspas(linha.slice(separador + 1).trim());
  }
}

module.exports = { carregarEnv };
