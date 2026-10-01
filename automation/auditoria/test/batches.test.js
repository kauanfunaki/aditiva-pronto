'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { criarLotes } = require('../src/batches');

function pasta(nome, arquivos) {
  return { nomePasta: nome, arquivos: Array.from({ length: arquivos }, (_, i) => ({ nome: `${i}.pdf` })) };
}

test('divide por 50 pastas', () => {
  const lotes = criarLotes(Array.from({ length: 51 }, (_, i) => pasta(`P${i}`, 0)));
  assert.deepEqual(lotes.map((lote) => lote.length), [50, 1]);
});

test('divide antes de ultrapassar 200 arquivos', () => {
  const lotes = criarLotes([pasta('A', 120), pasta('B', 90), pasta('C', 5)]);
  assert.deepEqual(lotes.map((lote) => lote.map((p) => p.nomePasta)), [['A'], ['B', 'C']]);
});

test('uma pasta acima do alvo segue inteira e respeita o limite absoluto da API', () => {
  const lotes = criarLotes([pasta('GRANDE', 250)], { maxArquivosPorLote: 5000 });
  assert.equal(lotes.length, 1);
  assert.equal(lotes[0][0].arquivos.length, 250);
  assert.throws(
    () => criarLotes([pasta('GRANDE DEMAIS', 6)], { maxArquivosPorLote: 5 }),
    /acima do limite da API/,
  );
});
