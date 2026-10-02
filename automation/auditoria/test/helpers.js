'use strict';

// Geradores de DOCX e PDF mínimos para os testes (sem depender de arquivo da rede).

const zlib = require('node:zlib');

function zip(entradas, metodo = 8) {
  const partes = [];
  const centrais = [];
  let deslocamento = 0;
  for (const [nome, conteudo] of entradas) {
    const dados = Buffer.from(conteudo, 'utf8');
    const gravado = metodo === 8 ? zlib.deflateRawSync(dados) : dados;
    const n = Buffer.from(nome, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(gravado.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(n.length, 26);
    partes.push(local, n, gravado);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt32LE(gravado.length, 20);
    central.writeUInt32LE(dados.length, 24);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(deslocamento, 42);
    centrais.push(central, n);

    deslocamento += 30 + n.length + gravado.length;
  }
  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  return Buffer.concat([...partes, diretorio, fim]);
}

function docx(paragrafos, metodo = 8) {
  const corpo = paragrafos
    .map((p) => `<w:p><w:r><w:t xml:space="preserve">${p}</w:t></w:r></w:p>`)
    .join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="x"><w:body>${corpo}</w:body></w:document>`;
  return zip([['[Content_Types].xml', '<Types/>'], ['word/document.xml', xml]], metodo);
}

/** PDF de uma página com texto em Helvetica (WinAnsi), xref correto. */
function pdf(linhas) {
  const escapar = (l) => l.replace(/[()\\]/g, '\\$&');
  const conteudo = linhas.length
    ? `BT /F1 12 Tf 72 720 Td ${linhas.map((l, i) => `${i ? '0 -16 Td ' : ''}(${escapar(l)}) Tj`).join(' ')} ET`
    : '';
  const objetos = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(conteudo, 'latin1')} >>\nstream\n${conteudo}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  let texto = '%PDF-1.4\n';
  const posicoes = [];
  objetos.forEach((o, i) => {
    posicoes.push(Buffer.byteLength(texto, 'latin1'));
    texto += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(texto, 'latin1');
  texto += `xref\n0 ${objetos.length + 1}\n0000000000 65535 f \n`;
  texto += posicoes.map((p) => `${String(p).padStart(10, '0')} 00000 n \n`).join('');
  texto += `trailer\n<< /Size ${objetos.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(texto, 'latin1');
}

module.exports = { docx, pdf, zip };
