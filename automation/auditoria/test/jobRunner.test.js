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

test('envia o primeiro lote antes de terminar a varredura completa', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-job-progress-'));
  try {
    const nomes = Array.from({ length: 51 }, (_, i) => `CLIENTE ${String(i).padStart(2, '0')}`);
    await Promise.all(nomes.map((nome) => fs.mkdir(path.join(raiz, nome))));

    let pastasLidas = 0;
    const envios = [];
    const loggerProgresso = {
      debug(mensagem) { if (mensagem === 'Pasta lida.') pastasLidas++; },
      info() {}, warn() {}, error() {},
    };
    const api = {
      async enviarLote(_id, lote) { envios.push({ quando: pastasLidas, quantidade: lote.pastas.length }); },
      async concluir() { return { vinculosAutomaticos: 0 }; },
      async falhar() {},
    };
    const trabalho = {
      job: { id: 'job-progress', origem: 'manual', retomada: false },
      config: {
        raizUnc: raiz,
        pastaInicial: nomes[0],
        pastaFinal: nomes[nomes.length - 1],
        regexSubpastaContrato: '^CONTRATO',
        normalizacao: 'semAcentoMaiusculo',
      },
      limites: { maxPastasPorLote: 500, maxArquivosPorLote: 5000 },
    };

    await executarJob({ api, trabalho, logger: loggerProgresso, signal: new AbortController().signal });
    assert.deepEqual(envios, [
      { quando: 50, quantidade: 50 },
      { quando: 51, quantidade: 1 },
    ]);
  } finally {
    await fs.rm(raiz, { recursive: true, force: true });
  }
});

test('manda os nomes da pasta de ex-clientes no fim; se ela não existir, conclui sem a lista', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-job-ex-'));
  try {
    await fs.mkdir(path.join(raiz, 'ALFA LTDA'));
    await fs.mkdir(path.join(raiz, '009_EMPRESAS EX CLIENTES', 'VELHA LTDA'), { recursive: true });
    const config = {
      raizUnc: raiz, pastaInicial: 'ALFA LTDA', pastaFinal: 'ALFA LTDA',
      regexSubpastaContrato: '^CONTRATO', normalizacao: 'semAcentoMaiusculo',
      pastaExClientes: '009_EMPRESAS EX CLIENTES',
    };
    const rodar = async (cfg) => {
      const recebido = {};
      const api = {
        async enviarLote() {},
        async concluir(_id, totais, ex) { recebido.totais = totais; recebido.ex = ex; return { vinculosAutomaticos: 0 }; },
        async falhar(_id, erro) { recebido.falha = erro; },
      };
      const r = await executarJob({
        api, logger, signal: new AbortController().signal,
        trabalho: { job: { id: 'j', origem: 'manual', retomada: false }, config: cfg, limites: { maxPastasPorLote: 500, maxArquivosPorLote: 5000 } },
      });
      return { r, recebido };
    };

    const ok = await rodar(config);
    assert.equal(ok.r.resultado, 'concluido');
    assert.deepEqual(ok.recebido.ex, ['VELHA LTDA']);
    assert.deepEqual(ok.recebido.totais, { pastas: 1, arquivos: 0 }); // a pasta de ex-clientes não entra no inventário

    const semPasta = await rodar({ ...config, pastaExClientes: 'NAO EXISTE' });
    assert.equal(semPasta.r.resultado, 'concluido');
    assert.equal(semPasta.recebido.ex, null);
    assert.equal(semPasta.recebido.falha, undefined);
  } finally {
    await fs.rm(raiz, { recursive: true, force: true });
  }
});
