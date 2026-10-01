'use strict';

const fs = require('node:fs/promises');

const MARCA_ICP_HEX = '4943502d42726173696c';

function analisarPdfBuffer(buffer) {
  const texto = buffer.toString('latin1');
  const assinado = texto.includes('/ByteRange');
  const icp = assinado && (
    texto.includes('ICP-Brasil') || texto.toLowerCase().includes(MARCA_ICP_HEX.toLowerCase())
  );
  return { assinado, marca: icp ? 'icp' : null };
}

async function analisarPdf(caminho) {
  return analisarPdfBuffer(await fs.readFile(caminho));
}

module.exports = { analisarPdf, analisarPdfBuffer, MARCA_ICP_HEX };
