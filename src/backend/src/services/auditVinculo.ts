// Vínculo pasta ↔ empresa — regras puras (sem banco).
//
// Vínculo automático só em dois casos, ambos sem chute:
//  1. o nome normalizado da pasta é igual ao de exatamente UMA empresa ativa;
//  2. a pasta é de filial ("… - 12 FILIAL - CURITIBA-PR"), o nome sem o trecho
//     da filial é igual ao da empresa e só UMA delas tem a ordem 0012 no CNPJ.
// Matriz e filiais têm a mesma razão social no Domínio, então nome repetido sem
// número de filial nunca vira vínculo automático. O resto vira sugestão.

import { normalizarNomeEmpresa, semAcentoMaiusculo, similaridade } from './auditNormalizacao';

export interface EmpresaVinculavel {
  id:          string;
  razaoSocial: string;
  cnpj:        string;
}

export interface EmpresaIndexada extends EmpresaVinculavel {
  nomeNormalizado: string;
  /** Ordem do estabelecimento no CNPJ (0001 = matriz), ou null se não for CNPJ. */
  ordemCnpj:       number | null;
}

export interface Sugestao extends EmpresaVinculavel {
  similaridade:  number;
  /** O número de filial da pasta bate com a ordem do CNPJ da empresa. */
  filialConfere: boolean;
}

/** Ordem do estabelecimento: dígitos 9 a 12 do CNPJ ("33.333.333/0012-33" → 12). */
export function ordemDoCnpj(cnpj: string): number | null {
  const digitos = cnpj.replace(/\D/g, '');
  return digitos.length === 14 ? parseInt(digitos.slice(8, 12), 10) : null;
}

/**
 * Número da filial escrito no nome da pasta. "MATRIZ" conta como 1 (ordem 0001).
 * "BLD LOGÍSTICA LTDA - 12 FILIAL - CURITIBA-PR" → 12 · "MH EXPRESS FILIAL 0002" → 2.
 */
export function filialDaPasta(nomePasta: string): number | null {
  const nome = semAcentoMaiusculo(nomePasta);
  const m = /\b(\d{1,4})\s*[ºª]?\s*FILIAL\b/.exec(nome) ?? /\bFILIAL\s*(\d{1,4})\b/.exec(nome);
  if (m) return parseInt(m[1], 10);
  return /\bMATRIZ\b/.test(nome) ? 1 : null;
}

/** Nome da pasta normalizado e sem o trecho de filial/matriz (e o que vem depois dele). */
export function nomeBaseDaPasta(nomePasta: string): string {
  return normalizarNomeEmpresa(nomePasta)
    .replace(/\s*\b\d{1,4} FILIAL\b.*$/, '')
    .replace(/\s*\bFILIAL( \d{1,4})?\b.*$/, '')
    .replace(/\s*\b(\d{1,4} )?MATRIZ\b.*$/, '')
    .trim();
}

export function indexarEmpresas(empresas: EmpresaVinculavel[]): EmpresaIndexada[] {
  return empresas.map((e) => ({
    ...e,
    nomeNormalizado: normalizarNomeEmpresa(e.razaoSocial),
    ordemCnpj:       ordemDoCnpj(e.cnpj),
  }));
}

/** Empresas agrupadas pelo nome normalizado. */
export function agruparPorNome(empresas: EmpresaIndexada[]): Map<string, EmpresaIndexada[]> {
  const mapa = new Map<string, EmpresaIndexada[]>();
  for (const e of empresas) {
    if (!e.nomeNormalizado) continue;
    const lista = mapa.get(e.nomeNormalizado);
    if (lista) lista.push(e);
    else mapa.set(e.nomeNormalizado, [e]);
  }
  return mapa;
}

/** Id da empresa para vincular automaticamente, ou null (sem par ou ambíguo). */
export function vinculoAutomatico(
  nomePasta: string,
  porNome: Map<string, EmpresaIndexada[]>,
): string | null {
  const exatas = porNome.get(normalizarNomeEmpresa(nomePasta));
  if (exatas?.length === 1) return exatas[0].id;

  const filial = filialDaPasta(nomePasta);
  if (filial === null) return null;
  const mesmaFilial = (porNome.get(nomeBaseDaPasta(nomePasta)) ?? [])
    .filter((e) => e.ordemCnpj === filial);
  return mesmaFilial.length === 1 ? mesmaFilial[0].id : null;
}

export interface PastaIndexada {
  nomePasta: string;
  nomeBase:  string;
  filial:    number | null;
}

export interface SugestaoDePasta {
  nomePasta:     string;
  similaridade:  number;
  filialConfere: boolean;
}

export function indexarPastas(nomes: string[]): PastaIndexada[] {
  return nomes.map((nomePasta) => ({
    nomePasta,
    nomeBase: nomeBaseDaPasta(nomePasta),
    filial:   filialDaPasta(nomePasta),
  }));
}

/**
 * A filial só desempata entre candidatas com nome praticamente igual ao da melhor
 * (até MARGEM_FILIAL abaixo dela). Sem isso, "MH EXPRESS TRANSPORTES - 02 FILIAL"
 * passava na frente de "AJL TRANSPORTES EXPRESS" (100%) só porque a AJL é a filial 0002.
 */
export const MARGEM_FILIAL = 0.05;

function ordenarComFilial<T>(
  candidatas: { item: T; s: number; bate: boolean }[],
  desempate: (a: T, b: T) => number,
): { item: T; s: number; bate: boolean }[] {
  if (!candidatas.length) return [];
  const melhor = Math.max(...candidatas.map((c) => c.s));
  return candidatas
    .map((c) => ({ ...c, bate: c.bate && c.s >= melhor - MARGEM_FILIAL }))
    .sort((x, y) => Number(y.bate) - Number(x.bate) || y.s - x.s || desempate(x.item, y.item));
}

/**
 * O caminho inverso de `sugerirEmpresas`: até `limite` pastas parecidas com a
 * empresa, entre as que ainda não têm vínculo. Entre pastas de nome praticamente
 * igual, a de filial cujo número bate com a ordem do CNPJ da empresa vem primeiro.
 */
export function sugerirPastas(
  empresa: EmpresaIndexada,
  pastas: PastaIndexada[],
  limite = 3,
  minimo = 0.6,
): SugestaoDePasta[] {
  if (!empresa.nomeNormalizado) return [];
  const candidatas = pastas
    .map((p) => ({
      item: p,
      s:    similaridade(empresa.nomeNormalizado, p.nomeBase),
      bate: p.filial !== null && p.filial === empresa.ordemCnpj,
    }))
    .filter(({ s }) => s >= minimo);
  return ordenarComFilial(candidatas, (a, b) => a.nomePasta.localeCompare(b.nomePasta))
    .slice(0, limite)
    .map(({ item: p, s, bate }) => ({
      nomePasta:     p.nomePasta,
      similaridade:  Math.round(s * 100) / 100,
      filialConfere: bate,
    }));
}

/**
 * Até `limite` empresas parecidas com a pasta. A comparação usa o nome sem o
 * trecho da filial; entre empresas de nome praticamente igual (matriz e filiais),
 * a que tem a ordem do CNPJ igual ao número da filial vem primeiro.
 */
export function sugerirEmpresas(
  nomePasta: string,
  empresas: EmpresaIndexada[],
  limite = 3,
  minimo = 0.6,
): Sugestao[] {
  const alvo = nomeBaseDaPasta(nomePasta);
  if (!alvo) return [];
  const filial = filialDaPasta(nomePasta);

  const candidatas = empresas
    .map((e) => ({
      item: e,
      s:    similaridade(alvo, e.nomeNormalizado),
      bate: filial !== null && e.ordemCnpj === filial,
    }))
    .filter(({ s }) => s >= minimo);
  return ordenarComFilial(candidatas, (a, b) => a.razaoSocial.localeCompare(b.razaoSocial))
    .slice(0, limite)
    .map(({ item: e, s, bate }) => ({
      id:            e.id,
      razaoSocial:   e.razaoSocial,
      cnpj:          e.cnpj,
      similaridade:  Math.round(s * 100) / 100,
      filialConfere: bate,
    }));
}
