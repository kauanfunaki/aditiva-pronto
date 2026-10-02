'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { processarTextos } = require('../src/textRunner');
const { docx, pdf } = require('./helpers');

const logger = { info() {}, warn() {}, error() {}, debug() {} };

test('processarTextos: lê os pendentes e devolve resultado por arquivo', async () => {
  const raiz = await fs.mkdtemp(path.join(os.tmpdir(), 'robo-raiz-'));
  try {
    const sub = path.join(raiz, 'EMPRESA X', 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS');
    await fs.mkdir(sub, { recursive: true });
    await fs.writeFile(path.join(sub, 'contrato.docx'), docx(['CLÁUSULA TERCEIRA: pagará honorários mensais no valor de R$ 600,00 (seiscentos reais)']));
    await fs.writeFile(path.join(sub, 'scan.pdf'), pdf([]));
    const info = async (n) => {
      const s = await fs.stat(path.join(sub, n));
      return { tamanho: s.size, modificadoEm: s.mtime.toISOString() };
    };

    const enviados = [];
    const api = {
      textosPendentes: async () => ({
        raizUnc: raiz,
        regexSubpastaContrato: '^CONTRATOS? (DE )?(P |PREST|SERVI|HONOR)',
        restantes: 4,
        arquivos: [
          { chave: 'a'.repeat(64), nomePasta: 'EMPRESA X', caminhoRelativo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS/contrato.docx', ...(await info('contrato.docx')) },
          { chave: 'b'.repeat(64), nomePasta: 'EMPRESA X', caminhoRelativo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS/scan.pdf', ...(await info('scan.pdf')) },
          { chave: 'c'.repeat(64), nomePasta: 'EMPRESA X', caminhoRelativo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS/sumiu.pdf', tamanho: 1, modificadoEm: new Date().toISOString() },
          { chave: 'd'.repeat(64), nomePasta: 'EMPRESA X', caminhoRelativo: 'FISCAL/x.pdf', tamanho: 1, modificadoEm: new Date().toISOString() },
        ],
      }),
      enviarTextos: async (textos) => { enviados.push(...textos); },
    };

    const r = await processarTextos({ api, config: { raizPermitida: raiz }, logger });
    assert.deepEqual({ ok: r.ok, sem_texto: r.sem_texto, erro: r.erro }, { ok: 1, sem_texto: 1, erro: 2 });

    const porChave = Object.fromEntries(enviados.map((t) => [t.chave[0], t]));
    assert.equal(porChave.a.status, 'ok');
    assert.match(porChave.a.texto, /R\$ 600,00/);
    assert.equal(porChave.b.status, 'sem_texto');
    assert.equal(porChave.b.texto, null);
    assert.equal(porChave.c.status, 'erro');
    assert.match(porChave.d.erro, /subpasta de contrato/);
    // Devolve exatamente o que o app pediu, para casar com o inventário.
    assert.equal(porChave.a.modificadoEm, (await info('contrato.docx')).modificadoEm);
  } finally {
    await fs.rm(raiz, { recursive: true, force: true });
  }
});

test('processarTextos: nada pendente não chama o envio', async () => {
  let chamou = false;
  const api = { textosPendentes: async () => null, enviarTextos: async () => { chamou = true; } };
  const r = await processarTextos({ api, config: { raizPermitida: 'x' }, logger });
  assert.equal(r.lidos, 0);
  assert.equal(chamou, false);
});
