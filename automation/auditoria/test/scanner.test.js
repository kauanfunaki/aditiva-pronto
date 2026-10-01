'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const {
  compilarRegex,
  listarPastasRaiz,
  semAcentoMaiusculo,
  varrerPasta,
} = require('../src/scanner');

async function comPastaTemporaria(fn) {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-robot-'));
  try {
    await fn(raiz);
  } finally {
    await fs.rm(raiz, { recursive: true, force: true });
  }
}

test('normaliza acentos, espaços e caixa', () => {
  assert.equal(semAcentoMaiusculo('  Contrato   de Prestação  '), 'CONTRATO DE PRESTACAO');
});

test('seleciona somente diretórios dentro do intervalo normalizado', async () => {
  await comPastaTemporaria(async (raiz) => {
    await Promise.all(['000 CONTROLE', 'ÁGUIA LTDA', 'BETA LTDA', 'Z OUTRA'].map((nome) =>
      fs.mkdir(path.join(raiz, nome))));
    await fs.writeFile(path.join(raiz, 'BETA.txt'), 'não é pasta');

    const pastas = await listarPastasRaiz({
      raizUnc: raiz,
      pastaInicial: 'AGUIA LTDA',
      pastaFinal: 'BETA LTDA',
    });
    assert.deepEqual(pastas, ['ÁGUIA LTDA', 'BETA LTDA']);
  });
});

test('varre recursivamente apenas subpastas de contrato do primeiro nível', async () => {
  await comPastaTemporaria(async (raiz) => {
    const cliente = path.join(raiz, 'CLIENTE LTDA');
    const contratos = path.join(cliente, 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS');
    await fs.mkdir(path.join(contratos, 'ANTIGOS'), { recursive: true });
    await fs.mkdir(path.join(cliente, 'CONTRATO DE ALUGUEL'));
    await fs.writeFile(path.join(contratos, 'Contrato atual.pdf'), '%PDF /ByteRange ICP-Brasil');
    await fs.writeFile(path.join(contratos, 'ANTIGOS', 'Contrato antigo.docx'), 'docx');
    await fs.writeFile(path.join(cliente, 'CONTRATO DE ALUGUEL', 'aluguel.pdf'), '%PDF');

    const resultado = await varrerPasta(
      raiz,
      'CLIENTE LTDA',
      compilarRegex('^CONTRATOS? (DE )?(P |PREST|SERVI|HONOR)'),
    );

    assert.deepEqual(resultado.subpastasContrato, ['CONTRATO DE PRESTAÇÃO DE SERVIÇOS']);
    assert.equal(resultado.erro, null);
    assert.deepEqual(resultado.arquivos.map((a) => a.caminhoRelativo), [
      'CONTRATO DE PRESTAÇÃO DE SERVIÇOS/ANTIGOS/Contrato antigo.docx',
      'CONTRATO DE PRESTAÇÃO DE SERVIÇOS/Contrato atual.pdf',
    ]);
    assert.deepEqual(resultado.arquivos[1].pdf, { assinado: true, marca: 'icp' });
  });
});

test('pasta sem subpasta de contrato também produz resultado', async () => {
  await comPastaTemporaria(async (raiz) => {
    await fs.mkdir(path.join(raiz, 'CLIENTE'));
    const resultado = await varrerPasta(raiz, 'CLIENTE', /PRESTACAO/);
    assert.deepEqual(resultado, {
      nomePasta: 'CLIENTE',
      subpastasContrato: [],
      erro: null,
      arquivos: [],
    });
  });
});
