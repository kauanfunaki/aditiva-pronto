'use strict';

const PASTAS_ALVO = 50;
const ARQUIVOS_ALVO = 200;

function criarLotes(pastas, limites = {}) {
  const maxPastas = Math.min(PASTAS_ALVO, limites.maxPastasPorLote ?? PASTAS_ALVO);
  const maxArquivos = Math.min(ARQUIVOS_ALVO, limites.maxArquivosPorLote ?? ARQUIVOS_ALVO);
  const absolutoArquivos = limites.maxArquivosPorLote ?? 5000;
  const lotes = [];
  let atual = [];
  let arquivosNoAtual = 0;

  const descarregar = () => {
    if (atual.length) lotes.push(atual);
    atual = [];
    arquivosNoAtual = 0;
  };

  for (const pasta of pastas) {
    const quantidade = pasta.arquivos.length;
    if (quantidade > absolutoArquivos) {
      throw new Error(
        `A pasta "${pasta.nomePasta}" tem ${quantidade} arquivos, acima do limite da API (${absolutoArquivos}).`,
      );
    }
    if (atual.length && (atual.length >= maxPastas || arquivosNoAtual + quantidade > maxArquivos)) {
      descarregar();
    }
    atual.push(pasta);
    arquivosNoAtual += quantidade;
    if (atual.length >= maxPastas || arquivosNoAtual >= maxArquivos) descarregar();
  }
  descarregar();
  return lotes;
}

module.exports = { ARQUIVOS_ALVO, PASTAS_ALVO, criarLotes };
