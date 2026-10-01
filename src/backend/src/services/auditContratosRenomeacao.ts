// Planejamento puro de renomeação. Esta camada nunca toca no filesystem.

import { palavrasContrato, type ArquivoParaClassificarContrato } from './auditContratosClassificador';

export type ResultadoPlanoRenomeacao =
  | 'recomendado'
  | 'ja_padronizado'
  | 'destino_existente';

export interface PlanoRenomeacaoContrato {
  dryRun:          true;
  executar:        false;
  recomendado:     boolean;
  caminhoOriginal: string;
  caminhoDestino:  string | null;
  resultado:       ResultadoPlanoRenomeacao;
}

function jaComecaAssinado(nome: string): boolean {
  const primeiras = palavrasContrato(nome).slice(0, 2);
  return primeiras[0] === 'ASS' || /^ASSINAD[OA]S?$/.test(primeiras[0] ?? '');
}

function chaveCaminho(caminho: string): string {
  return caminho.normalize('NFC').replace(/\\/g, '/').toLocaleUpperCase('pt-BR');
}

/** Deve ser chamada apenas para o contrato principal com assinatura digital confirmada. */
export function planejarRenomeacaoContrato(
  arquivo: ArquivoParaClassificarContrato,
  caminhosExistentes: Iterable<string>,
): PlanoRenomeacaoContrato {
  if (jaComecaAssinado(arquivo.nome)) {
    return {
      dryRun: true,
      executar: false,
      recomendado: false,
      caminhoOriginal: arquivo.caminhoRelativo,
      caminhoDestino: null,
      resultado: 'ja_padronizado',
    };
  }

  const partes = arquivo.caminhoRelativo.replace(/\\/g, '/').split('/');
  partes[partes.length - 1] = `ASSINADO - ${arquivo.nome}`;
  const destino = partes.join('/');
  const existentes = new Set([...caminhosExistentes].map(chaveCaminho));
  const conflito = existentes.has(chaveCaminho(destino));

  return {
    dryRun: true,
    executar: false,
    recomendado: !conflito,
    caminhoOriginal: arquivo.caminhoRelativo,
    caminhoDestino: destino,
    resultado: conflito ? 'destino_existente' : 'recomendado',
  };
}
