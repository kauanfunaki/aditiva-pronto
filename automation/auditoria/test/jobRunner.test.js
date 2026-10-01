'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { executarJob } = require('../src/jobRunner');

const logger = { debug() {}, info() {}, warn() {}, error() {} };

test('executa um job completo e envia totais consistentes', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-job-'));
  try {
    const contrato = path.join(raiz, 'ALFA LTDA', 'CONTRATO DE SERVIÇOS');
    await fs.mkdir(contrato, { recursive: true });
    await fs.writeFile(path.join(contrato, 'Contrato.pdf'), '%PDF');

    const chamadas = { lotes: [], conclusao: null, falha: null };
    const api = {
      async enviarLote(_id, lote) { chamadas.lotes.push(lote); },
      async concluir(_id, totais) { chamadas.conclusao = totais; return { vinculosAutomaticos: 1 }; },
      async falhar(_id, erro) { chamadas.falha = erro; },
    };
    const trabalho = {
      job: { id: 'job-1', origem: 'manual', retomada: false },
      config: {
        raizUnc: raiz,
        pastaInicial: 'ALFA LTDA',
        pastaFinal: 'ALFA LTDA',
        regexSubpastaContrato: '^CONTRATOS? (DE )?(P |PREST|SERVI|HONOR)',
        normalizacao: 'semAcentoMaiusculo',
      },
      limites: { maxPastasPorLote: 500, maxArquivosPorLote: 5000 },
    };

    const resultado = await executarJob({ api, trabalho, logger, signal: new AbortController().signal });
    assert.equal(resultado.resultado, 'concluido');
    assert.equal(chamadas.lotes.length, 1);
    assert.equal(chamadas.lotes[0].totalPastas, 1);
    assert.deepEqual(chamadas.conclusao, { pastas: 1, arquivos: 1 });
    assert.equal(chamadas.falha, null);
  } finally {
    await fs.rm(raiz, { recursive: true, force: true });
  }
});
