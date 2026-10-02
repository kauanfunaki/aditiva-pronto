// Texto dos documentos para o honorário: o app diz ao robô o que falta ler e guarda o que volta.
// O robô não escolhe arquivo: só lê o que está nesta lista (pastas vinculadas, PDF e DOCX
// da última sincronização), e o app ignora qualquer chave que não seja do inventário atual.

import { createHash } from 'crypto';
import * as base from '../repositories/auditRepository';
import * as aditivosRepo from '../repositories/auditAditivosRepository';
import * as repo from '../repositories/auditTextosRepository';
import { LEITOR_VERSAO, lerDocumento } from './honorarioLeitor';
import { logger } from '../utils/logger';

export const POR_RODADA = 40;
export const EXTENSOES_COM_TEXTO = new Set(['.pdf', '.docx']);

export function chaveDoArquivo(nomePasta: string, caminhoRelativo: string): string {
  return createHash('sha256').update(`${nomePasta}\n${caminhoRelativo}`).digest('hex');
}

export interface ArquivoDoInventario {
  chave:           string;
  nomePasta:       string;
  caminhoRelativo: string;
  nome:            string;
  modificadoEm:    Date;
  tamanho:         number;
}

/** A leitura guardada vale para esta versão do arquivo? */
export function mesmaVersao(
  a: { modificadoEm: Date; tamanho: number },
  t: { modificado_em: Date; tamanho: number },
): boolean {
  return Number(t.tamanho) === a.tamanho && Math.abs(t.modificado_em.getTime() - a.modificadoEm.getTime()) < 1000;
}

/** PDF/DOCX das pastas vinculadas a uma empresa, na última sincronização. */
export async function inventarioComTexto(): Promise<ArquivoDoInventario[]> {
  const ultimo = await base.buscarUltimoConcluido();
  if (!ultimo) return [];
  const [arquivos, vinculos] = await Promise.all([
    aditivosRepo.listarArquivosDoJob(ultimo.id),
    base.listarVinculos(),
  ]);
  const vinculadas = new Set(
    vinculos.filter((v) => v.tipo !== 'ignorado' && v.company_id).map((v) => v.nome_pasta),
  );
  return arquivos
    .filter((a) => vinculadas.has(a.nome_pasta) && EXTENSOES_COM_TEXTO.has(a.ext.toLowerCase()))
    .map((a) => ({
      chave:           chaveDoArquivo(a.nome_pasta, a.caminho_relativo),
      nomePasta:       a.nome_pasta,
      caminhoRelativo: a.caminho_relativo,
      nome:            a.nome,
      modificadoEm:    a.modificado_em,
      tamanho:         Number(a.tamanho),
    }));
}

/** O que ainda não tem texto lido (ou mudou desde a leitura). Contrato e honorário primeiro. */
export function selecionarPendentes(
  inventario: ArquivoDoInventario[],
  indice: Map<string, { modificado_em: Date; tamanho: number }>,
): ArquivoDoInventario[] {
  const prioridade = (a: ArquivoDoInventario) => (/contrato|honor/i.test(a.nome) ? 0 : 1);
  return inventario
    .filter((a) => {
      const t = indice.get(a.chave);
      return !t || !mesmaVersao(a, t);
    })
    .sort((a, b) =>
      prioridade(a) - prioridade(b) ||
      a.nomePasta.localeCompare(b.nomePasta, 'pt-BR') ||
      a.caminhoRelativo.localeCompare(b.caminhoRelativo, 'pt-BR'));
}

async function indiceDeTextos() {
  const linhas = await repo.listarIndiceTextos();
  return new Map(linhas.map((l) => [l.chave, l]));
}

export interface PedidoDeTextos {
  raizUnc:               string;
  regexSubpastaContrato: string;
  restantes:             number;
  arquivos: {
    chave: string; nomePasta: string; caminhoRelativo: string; modificadoEm: string; tamanho: number;
  }[];
}

/** Chamado pelo robô a cada rodada. null = nada a ler (o controller responde 204). */
export async function textosPendentes(host: string, versao: string | null): Promise<PedidoDeTextos | null> {
  await base.registrarHeartbeat(host, versao, new Date());
  const [inventario, indice, config] = await Promise.all([inventarioComTexto(), indiceDeTextos(), base.obterConfig()]);
  const pendentes = selecionarPendentes(inventario, indice);
  if (!pendentes.length) return null;
  return {
    raizUnc:               config.raizUnc,
    regexSubpastaContrato: config.regexSubpastaContrato,
    restantes:             pendentes.length,
    arquivos: pendentes.slice(0, POR_RODADA).map((a) => ({
      chave:           a.chave,
      nomePasta:       a.nomePasta,
      caminhoRelativo: a.caminhoRelativo,
      modificadoEm:    a.modificadoEm.toISOString(),
      tamanho:         a.tamanho,
    })),
  };
}

export interface TextoRecebido {
  chave:        string;
  modificadoEm: string;
  tamanho:      number;
  status:       'ok' | 'sem_texto' | 'erro';
  paginas?:     number | null;
  texto?:       string | null;
  erro?:        string | null;
}

/** Guarda o que o robô leu e já aplica o leitor de honorário. */
export async function receberTextos(
  itens: TextoRecebido[],
  roboVersao: string | null,
): Promise<{ gravados: number; ignorados: number }> {
  const inventario = new Map((await inventarioComTexto()).map((a) => [a.chave, a]));
  const agora = new Date();
  const gravar: repo.TextoParaGravar[] = [];
  let ignorados = 0;

  for (const t of itens) {
    const a = inventario.get(t.chave);
    // Fora do inventário atual (ou de outra versão do arquivo): não grava.
    if (!a || !mesmaVersao(a, { modificado_em: new Date(t.modificadoEm), tamanho: t.tamanho })) {
      ignorados++;
      continue;
    }
    const texto = t.status === 'ok' ? (t.texto ?? '') : null;
    gravar.push({
      chave:           a.chave,
      nomePasta:       a.nomePasta,
      caminhoRelativo: a.caminhoRelativo,
      modificadoEm:    a.modificadoEm,
      tamanho:         a.tamanho,
      status:          t.status === 'ok' && !texto ? 'sem_texto' : t.status,
      paginas:         t.paginas ?? null,
      texto:           texto || null,
      erro:            t.status === 'erro' ? (t.erro ?? 'Erro sem descrição.').slice(0, 500) : null,
      roboVersao,
      leitura:         texto ? lerDocumento(texto, a.nome) : null,
      leitorVersao:    LEITOR_VERSAO,
    });
  }

  for (let i = 0; i < gravar.length; i += 50) await repo.gravarTextos(gravar.slice(i, i + 50), agora);
  if (ignorados) logger.warn(`[textos] ${ignorados} texto(s) fora do inventário atual foram ignorados`);
  return { gravados: gravar.length, ignorados };
}

/** Relê com o leitor atual os textos lidos por uma versão antiga (sem ir à rede). */
export async function atualizarLeiturasAntigas(): Promise<number> {
  let total = 0;
  for (;;) {
    const lote = await repo.listarTextosDesatualizados(LEITOR_VERSAO, 200);
    if (!lote.length) break;
    for (const t of lote) {
      const nome = t.caminho_relativo.split('/').pop() ?? t.caminho_relativo;
      await repo.atualizarLeitura(t.chave, t.texto ? lerDocumento(t.texto, nome) : null, LEITOR_VERSAO);
    }
    total += lote.length;
  }
  if (total) logger.info(`[textos] ${total} leitura(s) refeitas com o leitor v${LEITOR_VERSAO}`);
  return total;
}
