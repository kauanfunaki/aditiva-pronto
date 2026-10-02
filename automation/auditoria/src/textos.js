'use strict';

// Extração de texto dos documentos (PDF e DOCX) para o app ler o honorário.
// Somente leitura: abre o arquivo, extrai o texto e devolve. Nada é gravado na rede.

const fs = require('node:fs/promises');
const path = require('node:path');
const zlib = require('node:zlib');
const { semAcentoMaiusculo } = require('./scanner');

const MAX_BYTES_ARQUIVO = 30 * 1024 * 1024;
const MAX_BYTES_XML = 20 * 1024 * 1024;
const MAX_PAGINAS = 80;
const MAX_CARACTERES = 200_000;
/** Menos letras que isto = documento digitalizado (imagem), sem texto para ler. */
const MIN_LETRAS = 30;
const EXTENSOES = new Set(['.pdf', '.docx']);

// ── Caminho permitido ─────────────────────────────────────────────

function normalizarRaiz(raiz) {
  return path.win32.normalize(String(raiz || '')).replace(/[\\/]+$/, '').toLowerCase();
}

/**
 * Só lê arquivo dentro de <raiz permitida>\<pasta do cliente>\<subpasta de contrato>\...
 * com extensão .pdf ou .docx. A raiz permitida vem do .env do robô (não do servidor):
 * mesmo que alguém altere a configuração do app, o robô não lê fora da pasta de clientes.
 */
function resolverCaminhoPermitido({ raizPermitida, raizUnc, nomePasta, caminhoRelativo, regexSubpasta }) {
  if (normalizarRaiz(raizUnc) !== normalizarRaiz(raizPermitida)) {
    throw new Error(`Raiz recusada: ${raizUnc} não é a raiz permitida no robô.`);
  }
  const partes = String(caminhoRelativo || '').split('/');
  if (partes.length < 2 || partes.some((p) => !p || p === '.' || p === '..' || /[\\:]/.test(p))) {
    throw new Error('Caminho relativo inválido.');
  }
  if (!nomePasta || /[\\/:]/.test(nomePasta) || nomePasta === '.' || nomePasta === '..') {
    throw new Error('Nome de pasta inválido.');
  }
  if (!regexSubpasta.test(semAcentoMaiusculo(partes[0]))) {
    throw new Error('Arquivo fora da subpasta de contrato.');
  }
  const ext = path.win32.extname(partes[partes.length - 1]).toLowerCase();
  if (!EXTENSOES.has(ext)) throw new Error(`Extensão não lida: ${ext || '(nenhuma)'}.`);

  const raiz = path.win32.normalize(raizPermitida);
  const completo = path.win32.join(raiz, nomePasta, ...partes);
  const relativo = path.win32.relative(raiz, completo);
  if (!relativo || relativo.startsWith('..') || path.win32.isAbsolute(relativo)) {
    throw new Error('Caminho fora da raiz permitida.');
  }
  return { caminho: completo, ext };
}

// ── DOCX (zip) sem dependência ────────────────────────────────────

/** Lê uma entrada de um zip (só "stored" e "deflate", o que o Word usa). */
function lerEntradaZip(buffer, nomeAlvo, maxBytes = MAX_BYTES_XML) {
  const ASSINATURA_FIM = 0x06054b50;
  let fim = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 0xffff); i--) {
    if (buffer.readUInt32LE(i) === ASSINATURA_FIM) { fim = i; break; }
  }
  if (fim < 0) throw new Error('DOCX inválido (zip sem diretório central).');

  const total = buffer.readUInt16LE(fim + 10);
  let p = buffer.readUInt32LE(fim + 16);
  for (let n = 0; n < total; n++) {
    if (buffer.readUInt32LE(p) !== 0x02014b50) throw new Error('DOCX inválido (diretório central corrompido).');
    const metodo = buffer.readUInt16LE(p + 10);
    const tamanhoComprimido = buffer.readUInt32LE(p + 20);
    const tamanhoReal = buffer.readUInt32LE(p + 24);
    const tamNome = buffer.readUInt16LE(p + 28);
    const tamExtra = buffer.readUInt16LE(p + 30);
    const tamComentario = buffer.readUInt16LE(p + 32);
    const inicioLocal = buffer.readUInt32LE(p + 42);
    const nome = buffer.toString('utf8', p + 46, p + 46 + tamNome);

    if (nome === nomeAlvo) {
      if (tamanhoReal > maxBytes) throw new Error(`${nomeAlvo} grande demais.`);
      if (buffer.readUInt32LE(inicioLocal) !== 0x04034b50) throw new Error('DOCX inválido (cabeçalho local).');
      const inicio = inicioLocal + 30 + buffer.readUInt16LE(inicioLocal + 26) + buffer.readUInt16LE(inicioLocal + 28);
      const dados = buffer.subarray(inicio, inicio + tamanhoComprimido);
      if (metodo === 0) return dados;
      if (metodo === 8) return zlib.inflateRawSync(dados, { maxOutputLength: maxBytes });
      throw new Error(`DOCX com compressão não suportada (${metodo}).`);
    }
    p += 46 + tamNome + tamExtra + tamComentario;
  }
  return null;
}

const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodificarXml(texto) {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
    if (e[0] === '#') {
      const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : '';
    }
    return ENTIDADES[e.toLowerCase()];
  });
}

/** Texto do word/document.xml: um parágrafo por linha, tabulação e quebra preservadas. */
function textoDoDocumentXml(xml) {
  const paragrafos = xml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || [];
  return paragrafos.map((p) => {
    let linha = '';
    for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>|<w:tab\/>|<w:(?:br|cr)\/>/g)) {
      if (m[1] !== undefined) linha += m[1];
      else linha += m[0].startsWith('<w:tab') ? '\t' : '\n';
    }
    return decodificarXml(linha);
  }).join('\n');
}

function extrairDocx(buffer) {
  const xml = lerEntradaZip(buffer, 'word/document.xml');
  if (!xml) throw new Error('DOCX sem word/document.xml.');
  return { paginas: null, texto: textoDoDocumentXml(xml.toString('utf8')) };
}

// ── PDF (unpdf: pdf.js empacotado, sem dependência nativa) ───────

let unpdf = null;
const carregarUnpdf = () => (unpdf ??= import('unpdf'));

async function extrairPdf(buffer, maxPaginas = MAX_PAGINAS) {
  const { getDocumentProxy } = await carregarUnpdf();
  const pdf = await getDocumentProxy(new Uint8Array(buffer), {
    verbosity: 0,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
  });
  try {
    const linhas = [];
    const ate = Math.min(pdf.numPages, maxPaginas);
    for (let i = 1; i <= ate; i++) {
      const pagina = await pdf.getPage(i);
      const conteudo = await pagina.getTextContent();
      let linha = '';
      for (const item of conteudo.items) {
        if (typeof item.str !== 'string') continue;
        linha += item.str;
        if (item.hasEOL) { linhas.push(linha); linha = ''; }
      }
      if (linha) linhas.push(linha);
      pagina.cleanup();
    }
    return { paginas: pdf.numPages, texto: linhas.join('\n') };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

// ── Montagem do resultado ─────────────────────────────────────────

function limparTexto(texto) {
  return texto
    .replace(/\u0000/g, '')
    .split(/\r?\n/)
    .map((l) => l.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, MAX_CARACTERES);
}

function contarLetras(texto) {
  const m = texto.match(/\p{L}/gu);
  return m ? m.length : 0;
}

/** Resultado para o app: ok (com texto), sem_texto (digitalizado) ou erro. */
async function extrairTexto(caminho, ext, { tamanhoEsperado, modificadoEsperado } = {}) {
  const stat = await fs.stat(caminho);
  if (tamanhoEsperado !== undefined && stat.size !== tamanhoEsperado) {
    return { status: 'erro', erro: 'O arquivo mudou desde a sincronização; será lido na próxima.' };
  }
  if (modificadoEsperado !== undefined && Math.abs(stat.mtime.getTime() - new Date(modificadoEsperado).getTime()) > 2000) {
    return { status: 'erro', erro: 'O arquivo mudou desde a sincronização; será lido na próxima.' };
  }
  if (stat.size > MAX_BYTES_ARQUIVO) {
    return { status: 'erro', erro: `Arquivo acima de ${MAX_BYTES_ARQUIVO / 1024 / 1024} MB não é lido.` };
  }

  const buffer = await fs.readFile(caminho);
  const bruto = ext === '.pdf' ? await extrairPdf(buffer) : extrairDocx(buffer);
  const texto = limparTexto(bruto.texto);
  if (contarLetras(texto) < MIN_LETRAS) return { status: 'sem_texto', paginas: bruto.paginas };
  return { status: 'ok', paginas: bruto.paginas, texto };
}

module.exports = {
  MAX_CARACTERES,
  extrairDocx,
  extrairPdf,
  extrairTexto,
  lerEntradaZip,
  limparTexto,
  resolverCaminhoPermitido,
  textoDoDocumentXml,
};
