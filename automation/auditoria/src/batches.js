'use strict';

const PASTAS_ALVO = 50;
const ARQUIVOS_ALVO = 200;

function criarAcumuladorLotes(limites = {}) {
  const maxPastas = Math.min(PASTAS_ALVO, limites.maxPastasPorLote ?? PASTAS_ALVO);
  const maxArquivos = Math.min(ARQUIVOS_ALVO, limites.maxArquivosPorLote ?? ARQUIVOS_ALVO);
  const absolutoArquivos = limites.maxArquivosPorLote ?? 5000;
  let atual = [];
  let arquivosNoAtual = 0;

  const descarregar = () => {
    if (!atual.length) return null;
    const lote = atual;
    atual = [];
    arquivosNoAtual = 0;
    return lote;
  };

  return {
    adicionar(pasta) {
      const prontos = [];
      const quantidade = pasta.arquivos.length;
      if (quantidade > absolutoArquivos) {
        throw new Error(
          `A pasta "${pasta.nomePasta}" tem ${quantidade} arquivos, acima do limite da API (${absolutoArquivos}).`,
        );
      }
      if (atual.length && (atual.length >= maxPastas || arquivosNoAtual + quantidade > maxArquivos)) {
        prontos.push(descarregar());
      }
      atual.push(pasta);
      arquivosNoAtual += quantidade;
      if (atual.length >= maxPastas || arquivosNoAtual >= maxArquivos) prontos.push(descarregar());
      return prontos.filter(Boolean);
    },
    finalizar() {
      const ultimo = descarregar();
      return ultimo ? [ultimo] : [];
    },
  };
}

function criarLotes(pastas, limites = {}) {
  const acumulador = criarAcumuladorLotes(limites);
  const lotes = [];
  for (const pasta of pastas) {
    lotes.push(...acumulador.adicionar(pasta));
  }
  lotes.push(...acumulador.finalizar());
  return lotes;
}

module.exports = { ARQUIVOS_ALVO, PASTAS_ALVO, criarAcumuladorLotes, criarLotes };
