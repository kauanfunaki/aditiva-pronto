'use strict';

const fs = require('node:fs/promises');

const MARCA_ICP_HEX = '4943502d42726173696c';
const MAX_PDF_BYTES = 30 * 1024 * 1024;

function analisarPdfBuffer(buffer) {
  const texto = buffer.toString('latin1');
  const assinado = texto.includes('/ByteRange');
  const icp = assinado && (
    texto.includes('ICP-Brasil') || texto.toLowerCase().includes(MARCA_ICP_HEX.toLowerCase())
  );
  return { assinado, marca: icp ? 'icp' : null };
}

/** Retorna null sem ler o conteúdo quando o PDF ultrapassa o teto de memória. */
async function analisarPdf(caminho, tamanhoConhecido) {
  const tamanho = tamanhoConhecido ?? (await fs.stat(caminho)).size;
  if (tamanho > MAX_PDF_BYTES) return null;
  return analisarPdfBuffer(await fs.readFile(caminho));
}

module.exports = { analisarPdf, analisarPdfBuffer, MARCA_ICP_HEX, MAX_PDF_BYTES };
