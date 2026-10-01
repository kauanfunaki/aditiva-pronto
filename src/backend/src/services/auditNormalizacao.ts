// Normalização de nomes usada pela Auditoria (base comum).
// Funções puras — o robô coletor precisa aplicar `semAcentoMaiusculo`
// exatamente igual (ver docs/PLANO-AUDITORIA-CONTRATOS-ADITIVOS.md, seção 8).

/**
 * Regex padrão da subpasta do contrato de serviço, aplicada sobre
 * `semAcentoMaiusculo(nomeDaSubpasta)`. Cobre as 26 grafias achadas na rede
 * (CONTRATO DE PRESTAÇÃO DE SERVIÇOS, CONTRATO P SERVIÇOS, CONTRATO DE
 * HONORÁRIOS…) e deixa de fora ALUGUEL, LOCAÇÃO, COWORKING, ALTERAÇÃO
 * CONTRATUAL e MODELO CONTRATO.
 */
export const REGEX_SUBPASTA_CONTRATO_PADRAO = '^CONTRATOS? (DE )?(P |PREST|SERVI|HONOR)';

/** Remove acentos, põe em maiúsculas e colapsa espaços. Mantém a pontuação. */
export function semAcentoMaiusculo(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Chave de uma pasta: o nome exato que o robô viu, só em NFC e sem espaço nas pontas. */
export function normalizarNomePasta(nome: string): string {
  return nome.normalize('NFC').trim();
}

const SUFIXOS_SOCIETARIOS = /\b(LTDA|EIRELI|ME|EPP|SA|S A|SLU|LIMITADA)\b/g;

/**
 * Nome de empresa (ou de pasta) para comparação: sem acento, maiúsculo,
 * sem "(antiga …)", sem sufixo societário, "&" vira "E" e pontuação vira espaço.
 * Aplicada dos dois lados, então "C&A CONSTRUTORA LTDA" e "C E A CONSTRUTORA" empatam.
 */
export function normalizarNomeEmpresa(nome: string): string {
  return semAcentoMaiusculo(nome)
    .replace(/\(.*?(\)|$)/g, ' ')
    .replace(/&/g, ' E ')
    .replace(/[^A-Z0-9]+/g, ' ')
    .replace(SUFIXOS_SOCIETARIOS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigramas(texto: string): Map<string, number> {
  const mapa = new Map<string, number>();
  for (let i = 0; i < texto.length - 1; i++) {
    const par = texto.slice(i, i + 2);
    mapa.set(par, (mapa.get(par) ?? 0) + 1);
  }
  return mapa;
}

/**
 * Similaridade de Sørensen–Dice entre dois nomes já normalizados (0 a 1).
 * Serve só para SUGERIR vínculo — nunca para vincular sozinho
 * ("CIC TRANSPORTES" × "TRANSCIC TRANSPORTES" passa de 0,85).
 */
export function similaridade(a: string, b: string): number {
  if (a === b) return a.length ? 1 : 0;
  if (a.length < 2 || b.length < 2) return 0;

  const ba = bigramas(a);
  const bb = bigramas(b);
  let comuns = 0;
  for (const [par, qtd] of ba) {
    comuns += Math.min(qtd, bb.get(par) ?? 0);
  }
  return (2 * comuns) / (a.length - 1 + (b.length - 1));
}
