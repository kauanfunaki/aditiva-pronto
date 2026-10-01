'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { analisarPdf } = require('./pdf');

function semAcentoMaiusculo(texto) {
  return texto.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
}

function mensagemErro(err) {
  const texto = err instanceof Error ? err.message : String(err);
  return texto.slice(0, 1000);
}

async function listarPastasRaiz(config) {
  const entradas = await fs.readdir(config.raizUnc, { withFileTypes: true });
  const inicio = semAcentoMaiusculo(config.pastaInicial);
  const fim = semAcentoMaiusculo(config.pastaFinal);

  return entradas
    .filter((entrada) => entrada.isDirectory())
    .map((entrada) => ({ nome: entrada.name, chave: semAcentoMaiusculo(entrada.name) }))
    .filter((entrada) => entrada.chave >= inicio && entrada.chave <= fim)
    .sort((a, b) => a.chave.localeCompare(b.chave, 'pt-BR'))
    .map((entrada) => entrada.nome);
}

async function listarArquivosRecursivamente(raizCliente, diretorio, arquivos, erros) {
  let entradas;
  try {
    entradas = await fs.readdir(diretorio, { withFileTypes: true });
  } catch (err) {
    erros.push(`${path.relative(raizCliente, diretorio) || '.'}: ${mensagemErro(err)}`);
    return;
  }

  entradas.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));
  for (const entrada of entradas) {
    const caminho = path.join(diretorio, entrada.name);
    if (entrada.isDirectory()) {
      await listarArquivosRecursivamente(raizCliente, caminho, arquivos, erros);
      continue;
    }
    if (!entrada.isFile()) continue;

    try {
      const stat = await fs.stat(caminho);
      const ext = path.extname(entrada.name).toLowerCase();
      const arquivo = {
        caminhoRelativo: path.relative(raizCliente, caminho).split(path.sep).join('/'),
        nome: entrada.name,
        ext,
        tamanho: stat.size,
        modificadoEm: stat.mtime.toISOString(),
      };
      if (ext === '.pdf') arquivo.pdf = await analisarPdf(caminho);
      arquivos.push(arquivo);
    } catch (err) {
      erros.push(`${path.relative(raizCliente, caminho)}: ${mensagemErro(err)}`);
    }
  }
}

async function varrerPasta(raizUnc, nomePasta, regexSubpastaContrato) {
  const raizCliente = path.join(raizUnc, nomePasta);
  const resultado = { nomePasta, subpastasContrato: [], erro: null, arquivos: [] };

  try {
    const entradas = await fs.readdir(raizCliente, { withFileTypes: true });
    resultado.subpastasContrato = entradas
      .filter((entrada) => entrada.isDirectory() && regexSubpastaContrato.test(semAcentoMaiusculo(entrada.name)))
      .map((entrada) => entrada.name)
      .sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));

    const erros = [];
    for (const subpasta of resultado.subpastasContrato) {
      await listarArquivosRecursivamente(raizCliente, path.join(raizCliente, subpasta), resultado.arquivos, erros);
    }
    if (erros.length) resultado.erro = erros.join(' | ').slice(0, 1000);
  } catch (err) {
    resultado.erro = mensagemErro(err);
  }

  return resultado;
}

function compilarRegex(texto) {
  try {
    return new RegExp(texto);
  } catch (err) {
    throw new Error(`regexSubpastaContrato inválida: ${mensagemErro(err)}`);
  }
}

module.exports = {
  compilarRegex,
  listarPastasRaiz,
  mensagemErro,
  semAcentoMaiusculo,
  varrerPasta,
};
