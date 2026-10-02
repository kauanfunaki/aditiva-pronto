// Texto dos documentos (migration 008): o que o robô extraiu e o que o app leu dele.
// Datas sempre vêm do app (o pool grava em UTC).

import { RowDataPacket } from 'mysql2';
import { getPool } from '../database/connection';
import type { LeituraDoDocumento } from '../services/honorarioLeitor';

export interface IndiceTextoRow extends RowDataPacket {
  chave:         string;
  modificado_em: Date;
  tamanho:       number;
}

export async function listarIndiceTextos(): Promise<IndiceTextoRow[]> {
  const [rows] = await getPool().query<IndiceTextoRow[]>(
    `SELECT chave, modificado_em, tamanho FROM au_textos`,
  );
  return rows;
}

export interface TextoParaGravar {
  chave:           string;
  nomePasta:       string;
  caminhoRelativo: string;
  modificadoEm:    Date;
  tamanho:         number;
  status:          'ok' | 'sem_texto' | 'erro';
  paginas:         number | null;
  texto:           string | null;
  erro:            string | null;
  roboVersao:      string | null;
  leitura:         LeituraDoDocumento | null;
  leitorVersao:    number;
}

function colunasDaLeitura(l: LeituraDoDocumento | null) {
  return [
    l?.tipo ?? null,
    l?.data ?? null,
    l?.leitura?.valor ?? null,
    l?.leitura?.adicionalPorFuncionario ?? null,
    l?.leitura?.forma ?? null,
    l?.leitura ? (l.leitura.condicional ? 1 : 0) : null,
    l?.leitura?.trecho ?? null,
  ];
}

export async function gravarTextos(itens: TextoParaGravar[], agora: Date): Promise<void> {
  if (!itens.length) return;
  const valores = itens.map((t) => [
    t.chave, t.nomePasta, t.caminhoRelativo, t.modificadoEm, t.tamanho, t.status, t.paginas,
    t.texto, t.erro, agora, t.roboVersao, t.leitorVersao, ...colunasDaLeitura(t.leitura),
  ]);
  await getPool().query(
    `INSERT INTO au_textos
       (chave, nome_pasta, caminho_relativo, modificado_em, tamanho, status, paginas,
        texto, erro, extraido_em, robo_versao, leitor_versao,
        tipo_documento, data_documento, honorario, adicional_funcionario, forma_leitura, condicional, trecho)
     VALUES ?
     ON DUPLICATE KEY UPDATE
       nome_pasta = VALUES(nome_pasta), caminho_relativo = VALUES(caminho_relativo),
       modificado_em = VALUES(modificado_em), tamanho = VALUES(tamanho), status = VALUES(status),
       paginas = VALUES(paginas), texto = VALUES(texto), erro = VALUES(erro),
       extraido_em = VALUES(extraido_em), robo_versao = VALUES(robo_versao),
       leitor_versao = VALUES(leitor_versao), tipo_documento = VALUES(tipo_documento),
       data_documento = VALUES(data_documento), honorario = VALUES(honorario),
       adicional_funcionario = VALUES(adicional_funcionario), forma_leitura = VALUES(forma_leitura),
       condicional = VALUES(condicional), trecho = VALUES(trecho)`,
    [valores],
  );
}

export interface LeituraRow extends RowDataPacket {
  chave:                 string;
  modificado_em:         Date;
  tamanho:               number;
  status:                'ok' | 'sem_texto' | 'erro';
  erro:                  string | null;
  tipo_documento:        'contrato' | 'aditivo' | 'outro' | null;
  data_documento:        string | null;
  honorario:             string | null;      // DECIMAL vem como texto
  adicional_funcionario: string | null;
  forma_leitura:         string | null;
  condicional:           number | null;
  trecho:                string | null;
}

/** Leituras sem o texto (o relatório não precisa dele). */
export async function listarLeituras(): Promise<LeituraRow[]> {
  const [rows] = await getPool().query<LeituraRow[]>(
    `SELECT chave, modificado_em, tamanho, status, erro, tipo_documento,
            DATE_FORMAT(data_documento, '%Y-%m-%d') AS data_documento,
            honorario, adicional_funcionario, forma_leitura, condicional, trecho
     FROM au_textos`,
  );
  return rows;
}

interface TextoDesatualizadoRow extends RowDataPacket {
  chave:            string;
  caminho_relativo: string;
  texto:            string | null;
}

/** Textos lidos por uma versão antiga do leitor (para reler sem ir à rede). */
export async function listarTextosDesatualizados(versao: number, limite: number): Promise<TextoDesatualizadoRow[]> {
  const [rows] = await getPool().query<TextoDesatualizadoRow[]>(
    `SELECT chave, caminho_relativo, texto FROM au_textos
     WHERE status = 'ok' AND leitor_versao <> ? LIMIT ?`,
    [versao, limite],
  );
  return rows;
}

export async function atualizarLeitura(chave: string, leitura: LeituraDoDocumento | null, versao: number): Promise<void> {
  await getPool().query(
    `UPDATE au_textos SET leitor_versao = ?, tipo_documento = ?, data_documento = ?, honorario = ?,
       adicional_funcionario = ?, forma_leitura = ?, condicional = ?, trecho = ?
     WHERE chave = ?`,
    [versao, ...colunasDaLeitura(leitura), chave],
  );
}

export interface LeituraPorChaveRow extends RowDataPacket {
  chave:          string;
  modificado_em:  Date;
  tamanho:        number;
  status:         'ok' | 'sem_texto' | 'erro';
  data_documento: string | null;
  tipo_documento: 'contrato' | 'aditivo' | 'outro' | null;
  texto?:         string | null;
}

/** Leituras de algumas chaves; o texto só vem quando pedido (distrato precisa dele). */
export async function listarPorChaves(chaves: string[], comTexto: boolean): Promise<LeituraPorChaveRow[]> {
  const saida: LeituraPorChaveRow[] = [];
  for (let i = 0; i < chaves.length; i += 500) {
    const lote = chaves.slice(i, i + 500);
    const [rows] = await getPool().query<LeituraPorChaveRow[]>(
      `SELECT chave, modificado_em, tamanho, status, DATE_FORMAT(data_documento, '%Y-%m-%d') AS data_documento,
              tipo_documento${comTexto ? ', texto' : ''}
       FROM au_textos WHERE chave IN (?)`,
      [lote],
    );
    saida.push(...rows);
  }
  return saida;
}
