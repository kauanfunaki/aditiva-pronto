'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  extrairDocx, extrairPdf, extrairTexto, lerEntradaZip, resolverCaminhoPermitido, textoDoDocumentXml,
} = require('../src/textos');
const { docx, pdf, zip } = require('./helpers');

const RAIZ = String.raw`\\192.168.140.249\Contabilidade`;
const REGEX = /^CONTRATOS? (DE )?(P |PREST|SERVI|HONOR)/;

test('DOCX: lê o texto do document.xml (deflate e sem compressão)', () => {
  for (const metodo of [8, 0]) {
    const { texto } = extrairDocx(docx(['CLÁUSULA TERCEIRA', 'honorários mensais no valor de R$ 600,00'], metodo));
    assert.match(texto, /CLÁUSULA TERCEIRA\nhonorários mensais no valor de R\$ 600,00/);
  }
});

test('DOCX: decodifica entidades e preserva tabulação e quebra', () => {
  const xml = '<w:p><w:r><w:t>A &amp; B &lt;x&gt; &#225;</w:t><w:tab/><w:t>fim</w:t><w:br/><w:t>linha</w:t></w:r></w:p>';
  assert.equal(textoDoDocumentXml(xml), 'A & B <x> á\tfim\nlinha');
});

test('DOCX: recusa zip inválido e entrada grande demais', () => {
  assert.throws(() => extrairDocx(Buffer.from('não é zip')), /zip/);
  const grande = zip([['word/document.xml', 'x'.repeat(5000)]]);
  assert.throws(() => lerEntradaZip(grande, 'word/document.xml', 1000), /grande demais/);
  assert.equal(lerEntradaZip(grande, 'outra.xml'), null);
});

test('PDF: extrai texto com acento e valor', async () => {
  const r = await extrairPdf(pdf(['honorários mensais no valor de R$ 1.412,00', 'Curitiba, 05 de maio de 2026.']));
  assert.equal(r.paginas, 1);
  assert.match(r.texto, /honorários mensais no valor de R\$ 1\.412,00/);
  assert.match(r.texto, /05 de maio de 2026/);
});

test('extrairTexto: ok, sem texto (digitalizado) e arquivo que mudou', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'robo-textos-'));
  try {
    const comTexto = path.join(dir, 'a.pdf');
    await fs.writeFile(comTexto, pdf(['O valor do honorário mensal passa a ser de R$ 1.199,14 a partir de maio.']));
    const r1 = await extrairTexto(comTexto, '.pdf');
    assert.equal(r1.status, 'ok');
    assert.match(r1.texto, /R\$ 1\.199,14/);

    const vazio = path.join(dir, 'b.pdf');
    await fs.writeFile(vazio, pdf([]));
    assert.equal((await extrairTexto(vazio, '.pdf')).status, 'sem_texto');

    const stat = await fs.stat(comTexto);
    const mudou = await extrairTexto(comTexto, '.pdf', { tamanhoEsperado: stat.size + 1 });
    assert.equal(mudou.status, 'erro');
    assert.match(mudou.erro, /mudou/);

    const doc = path.join(dir, 'c.docx');
    await fs.writeFile(doc, docx(['TERMO ADITIVO', 'os honorários mensais passarão a ser de R$ 3.240,00']));
    const r3 = await extrairTexto(doc, '.docx', {
      tamanhoEsperado: (await fs.stat(doc)).size,
      modificadoEsperado: (await fs.stat(doc)).mtime.toISOString(),
    });
    assert.equal(r3.status, 'ok');
    assert.equal(r3.paginas, null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('resolverCaminhoPermitido: aceita documento da subpasta de contrato', () => {
  const r = resolverCaminhoPermitido({
    raizPermitida: RAIZ,
    raizUnc: String.raw`\\192.168.140.249\Contabilidade\\`,
    nomePasta: 'EMPRESA X LTDA',
    caminhoRelativo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS/2026/Termo Aditivo.PDF',
    regexSubpasta: REGEX,
  });
  assert.equal(r.caminho, String.raw`\\192.168.140.249\Contabilidade\EMPRESA X LTDA\CONTRATO DE PRESTAÇÃO DE SERVIÇOS\2026\Termo Aditivo.PDF`);
  assert.equal(r.ext, '.pdf');
});

test('resolverCaminhoPermitido: recusa raiz, subpasta, extensão e caminhos estranhos', () => {
  const base = {
    raizPermitida: RAIZ, raizUnc: RAIZ, nomePasta: 'EMPRESA X',
    caminhoRelativo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS/a.pdf', regexSubpasta: REGEX,
  };
  const recusa = (alteracao, erro) => assert.throws(() => resolverCaminhoPermitido({ ...base, ...alteracao }), erro);

  recusa({ raizUnc: 'C:\\Users' }, /Raiz recusada/);
  recusa({ caminhoRelativo: 'FISCAL/a.pdf' }, /subpasta de contrato/);
  recusa({ caminhoRelativo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS/a.xlsx' }, /Extensão/);
  recusa({ caminhoRelativo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS/../../x.pdf' }, /inválido/);
  recusa({ caminhoRelativo: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS/a\\..\\b.pdf' }, /inválido/);
  recusa({ caminhoRelativo: 'a.pdf' }, /inválido/);
  recusa({ nomePasta: '..' }, /Nome de pasta/);
  recusa({ nomePasta: 'A\\B' }, /Nome de pasta/);
});
