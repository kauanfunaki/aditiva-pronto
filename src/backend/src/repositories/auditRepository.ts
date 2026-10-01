// Acesso ao banco da Auditoria — base comum (tabelas au_*).
//
// Horários: todo DATETIME é gravado a partir de um `Date` do app (UTC, pelo
// `timezone: '+00:00'` do pool). Nada de NOW()/CURRENT_TIMESTAMP aqui, porque
// o fuso da sessão do MySQL de produção não é garantido.
//
// Empresas: nenhuma consulta faz JOIN com `companies` — a collation dessa
// tabela em produção não foi conferida, e comparar colunas de collations
// diferentes dá "Illegal mix of collations". O cruzamento é feito em memória.

import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { getPool } from '../database/connection';
import { normalizarNomePasta, REGEX_SUBPASTA_CONTRATO_PADRAO } from '../services/auditNormalizacao';
import type { Lote } from '../services/auditPayload';

// ── Tipos ─────────────────────────────────────────────────────────

export type JobStatus = 'pendente' | 'executando' | 'concluido' | 'erro';
export type JobOrigem = 'manual' | 'agendado';
export type TipoVinculo = 'auto' | 'confirmado' | 'ignorado';

export interface AuditConfig {
  raizUnc:               string;
  pastaInicial:          string;
  pastaFinal:            string;
  regexSubpastaContrato: string;
  horarioAgendado:       string | null;
}

export const CONFIG_PADRAO: AuditConfig = {
  raizUnc:               '\\\\192.168.140.249\\Contabilidade',
  pastaInicial:          '041 CONTABILIDADE',
  pastaFinal:            'ZANATO & CHAVES LTDA',
  regexSubpastaContrato: REGEX_SUBPASTA_CONTRATO_PADRAO,
  horarioAgendado:       '06:00',
};

export interface JobRow extends RowDataPacket {
  id:                 string;
  status:             JobStatus;
  origem:             JobOrigem;
  solicitado_em:      Date;
  iniciado_em:        Date | null;
  ultimo_lote_em:     Date | null;
  concluido_em:       Date | null;
  robo_host:          string | null;
  pastas_total:       number | null;
  pastas_recebidas:   number;
  arquivos_recebidos: number;
  erro:               string | null;
}

export interface HeartbeatRow extends RowDataPacket {
  host:     string;
  versao:   string | null;
  visto_em: Date;
}

export interface PastaDoJobRow extends RowDataPacket {
  nome_pasta:         string;
  subpastas_contrato: string[];
  erro:               string | null;
  arquivos:           number;
}

export interface VinculoRow extends RowDataPacket {
  nome_pasta: string;
  company_id: string | null;
  tipo:       TipoVinculo;
}

export interface EmpresaRow extends RowDataPacket {
  id:           string;
  razao_social: string;
  cnpj:         string;
  responsavel:  string | null;
  inativo:      number;
}

export interface MarcaSemPastaRow extends RowDataPacket {
  company_id: string;
  motivo:     string | null;
  marcado_em: Date;
}

const COLUNAS_JOB = `
  id, status, origem, solicitado_em, iniciado_em, ultimo_lote_em, concluido_em,
  robo_host, pastas_total, pastas_recebidas, arquivos_recebidos, erro
`;

// ── Configuração ──────────────────────────────────────────────────

interface ConfigRow extends RowDataPacket {
  raiz_unc:                string;
  pasta_inicial:           string;
  pasta_final:             string;
  regex_subpasta_contrato: string;
  horario_agendado:        string | null;
}

/** Lê a configuração; na primeira vez grava os valores padrão. */
export async function obterConfig(): Promise<AuditConfig> {
  const db = getPool();
  await db.query(
    `INSERT IGNORE INTO au_config
       (id, raiz_unc, pasta_inicial, pasta_final, regex_subpasta_contrato, horario_agendado)
     VALUES (1, ?, ?, ?, ?, ?)`,
    [
      CONFIG_PADRAO.raizUnc, CONFIG_PADRAO.pastaInicial, CONFIG_PADRAO.pastaFinal,
      CONFIG_PADRAO.regexSubpastaContrato, CONFIG_PADRAO.horarioAgendado,
    ],
  );
  const [rows] = await db.query<ConfigRow[]>(
    `SELECT raiz_unc, pasta_inicial, pasta_final, regex_subpasta_contrato, horario_agendado
     FROM au_config WHERE id = 1`,
  );
  const r = rows[0];
  return {
    raizUnc:               r.raiz_unc,
    pastaInicial:          r.pasta_inicial,
    pastaFinal:            r.pasta_final,
    regexSubpastaContrato: r.regex_subpasta_contrato,
    horarioAgendado:       r.horario_agendado,
  };
}

// ── Jobs ──────────────────────────────────────────────────────────

/** Lança ER_DUP_ENTRY se já houver um job ativo (índice único em `ativo`). */
export async function inserirJob(id: string, origem: JobOrigem, agora: Date): Promise<void> {
  await getPool().query(
    `INSERT INTO au_sync_jobs (id, status, origem, solicitado_em) VALUES (?, 'pendente', ?, ?)`,
    [id, origem, agora],
  );
}

async function umJob(sql: string, params: unknown[] = []): Promise<JobRow | null> {
  const [rows] = await getPool().query<JobRow[]>(sql, params);
  return rows[0] ?? null;
}

export const buscarJob = (id: string) =>
  umJob(`SELECT ${COLUNAS_JOB} FROM au_sync_jobs WHERE id = ?`, [id]);

export const buscarJobAtivo = () =>
  umJob(`SELECT ${COLUNAS_JOB} FROM au_sync_jobs WHERE ativo = 1`);

export const buscarJobPendente = () =>
  umJob(`SELECT ${COLUNAS_JOB} FROM au_sync_jobs WHERE status = 'pendente' ORDER BY solicitado_em LIMIT 1`);

export const buscarJobExecutandoDoHost = (host: string) =>
  umJob(`SELECT ${COLUNAS_JOB} FROM au_sync_jobs WHERE status = 'executando' AND robo_host = ? LIMIT 1`, [host]);

export const buscarUltimoConcluido = () =>
  umJob(`SELECT ${COLUNAS_JOB} FROM au_sync_jobs WHERE status = 'concluido' ORDER BY concluido_em DESC, solicitado_em DESC LIMIT 1`);

/** Último job que terminou, com sucesso ou com erro. */
export const buscarUltimoFinalizado = () =>
  umJob(
    `SELECT ${COLUNAS_JOB} FROM au_sync_jobs
     WHERE status IN ('concluido', 'erro')
     ORDER BY COALESCE(concluido_em, solicitado_em) DESC, solicitado_em DESC LIMIT 1`,
  );

export async function buscarUltimaSolicitacao(): Promise<Date | null> {
  const [rows] = await getPool().query<(RowDataPacket & { ultimo: Date | null })[]>(
    `SELECT MAX(solicitado_em) AS ultimo FROM au_sync_jobs`,
  );
  return rows[0]?.ultimo ?? null;
}

/** Marca o job como "executando" para este robô. false = outro robô pegou antes. */
export async function reivindicarJob(id: string, host: string, agora: Date): Promise<boolean> {
  const [r] = await getPool().query<ResultSetHeader>(
    `UPDATE au_sync_jobs
     SET status = 'executando', robo_host = ?, iniciado_em = ?, ultimo_lote_em = ?
     WHERE id = ? AND status = 'pendente'`,
    [host, agora, agora, id],
  );
  return r.affectedRows === 1;
}

/**
 * Encerra com erro o job que parou de mandar lote (robô caiu no meio) e o
 * pendente esquecido há muito tempo (robô offline por dias).
 */
export async function expirarJobsParados(
  agora: Date,
  minutosSemLote = 15,
  horasPendente = 24,
): Promise<number> {
  const limiteExecutando = new Date(agora.getTime() - minutosSemLote * 60_000);
  const limitePendente   = new Date(agora.getTime() - horasPendente * 3_600_000);
  // O MySQL avalia as atribuições da esquerda para a direita: `erro` lê o
  // status antigo, então precisa vir antes de `status = 'erro'`.
  const [r] = await getPool().query<ResultSetHeader>(
    `UPDATE au_sync_jobs
     SET erro = IF(status = 'executando',
                   CONCAT('O robô parou de enviar dados por mais de ', ?, ' minutos.'),
                   CONCAT('Nenhum robô pegou a sincronização em ', ?, ' horas.')),
         concluido_em = ?,
         status = 'erro'
     WHERE (status = 'executando' AND COALESCE(ultimo_lote_em, iniciado_em) < ?)
        OR (status = 'pendente'   AND solicitado_em < ?)`,
    [minutosSemLote, horasPendente, agora, limiteExecutando, limitePendente],
  );
  return r.affectedRows;
}

export async function falharJob(id: string, erro: string, agora: Date): Promise<boolean> {
  const [r] = await getPool().query<ResultSetHeader>(
    `UPDATE au_sync_jobs SET status = 'erro', erro = ?, concluido_em = ?
     WHERE id = ? AND status = 'executando'`,
    [erro, agora, id],
  );
  return r.affectedRows === 1;
}

/**
 * Grava um lote do robô. Idempotente por pasta: reenviar a mesma pasta
 * substitui os arquivos dela, sem duplicar.
 */
export async function gravarLote(
  jobId: string,
  lote: Lote,
  agora: Date,
): Promise<'ok' | 'job_inativo'> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();

    const [jobs] = await conn.query<JobRow[]>(
      `SELECT status FROM au_sync_jobs WHERE id = ? FOR UPDATE`,
      [jobId],
    );
    if (jobs[0]?.status !== 'executando') {
      await conn.rollback();
      return 'job_inativo';
    }

    for (const pasta of lote.pastas) {
      const [r] = await conn.query<ResultSetHeader>(
        `INSERT INTO au_folders (job_id, nome_pasta, subpastas_contrato, erro)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           id                 = LAST_INSERT_ID(id),
           subpastas_contrato = VALUES(subpastas_contrato),
           erro               = VALUES(erro)`,
        [
          jobId,
          normalizarNomePasta(pasta.nomePasta),
          JSON.stringify(pasta.subpastasContrato.map(normalizarNomePasta)),
          pasta.erro ?? null,
        ],
      );
      const folderId = r.insertId;

      await conn.query(`DELETE FROM au_files WHERE folder_id = ?`, [folderId]);

      if (pasta.arquivos.length) {
        const valores = pasta.arquivos.map((a) => [
          jobId,
          folderId,
          a.caminhoRelativo.normalize('NFC'),
          a.nome.normalize('NFC'),
          a.ext,
          a.tamanho,
          new Date(a.modificadoEm),
          a.pdf ? (a.pdf.assinado ? 1 : 0) : null,
          a.pdf?.marca ?? null,
        ]);
        await conn.query(
          `INSERT INTO au_files
             (job_id, folder_id, caminho_relativo, nome, ext, tamanho, modificado_em, pdf_assinado, pdf_marca)
           VALUES ?`,
          [valores],
        );
      }
    }

    await conn.query(
      `UPDATE au_sync_jobs SET
         pastas_recebidas   = (SELECT COUNT(*) FROM au_folders WHERE job_id = ?),
         arquivos_recebidos = (SELECT COUNT(*) FROM au_files   WHERE job_id = ?),
         pastas_total       = COALESCE(?, pastas_total),
         ultimo_lote_em     = ?
       WHERE id = ?`,
      [jobId, jobId, lote.totalPastas ?? null, agora, jobId],
    );

    await conn.commit();
    return 'ok';
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export interface ResultadoConclusao {
  resultado: 'ok' | 'divergente' | 'job_inativo';
  recebido:  { pastas: number; arquivos: number };
}

/**
 * Fecha o job conferindo os totais do robô com o que chegou. Se não bater,
 * o job vira erro — e o relatório continua mostrando a última sincronização boa.
 */
export async function concluirJob(
  jobId: string,
  totais: { pastas: number; arquivos: number },
  agora: Date,
): Promise<ResultadoConclusao> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();

    const [jobs] = await conn.query<JobRow[]>(
      `SELECT status FROM au_sync_jobs WHERE id = ? FOR UPDATE`,
      [jobId],
    );
    if (jobs[0]?.status !== 'executando') {
      await conn.rollback();
      return { resultado: 'job_inativo', recebido: { pastas: 0, arquivos: 0 } };
    }

    const [contagem] = await conn.query<(RowDataPacket & { pastas: number; arquivos: number })[]>(
      `SELECT
         (SELECT COUNT(*) FROM au_folders WHERE job_id = ?) AS pastas,
         (SELECT COUNT(*) FROM au_files   WHERE job_id = ?) AS arquivos`,
      [jobId, jobId],
    );
    const recebido = { pastas: Number(contagem[0].pastas), arquivos: Number(contagem[0].arquivos) };
    const bate = recebido.pastas === totais.pastas && recebido.arquivos === totais.arquivos;

    await conn.query(
      `UPDATE au_sync_jobs SET
         status = ?, erro = ?, concluido_em = ?,
         pastas_recebidas = ?, arquivos_recebidos = ?
       WHERE id = ?`,
      [
        bate ? 'concluido' : 'erro',
        bate ? null : `Totais não batem: chegaram ${recebido.pastas} de ${totais.pastas} pastas e ` +
                      `${recebido.arquivos} de ${totais.arquivos} arquivos.`,
        agora, recebido.pastas, recebido.arquivos, jobId,
      ],
    );

    await conn.commit();
    return { resultado: bate ? 'ok' : 'divergente', recebido };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/** Apaga jobs finalizados mais velhos que `dias`, sempre preservando o último concluído. */
export async function limparJobsAntigos(agora: Date, dias = 30): Promise<number> {
  const limite = new Date(agora.getTime() - dias * 86_400_000);
  const [r] = await getPool().query<ResultSetHeader>(
    `DELETE FROM au_sync_jobs
     WHERE ativo IS NULL
       AND solicitado_em < ?
       AND id <> COALESCE((
         SELECT id FROM (
           SELECT id FROM au_sync_jobs WHERE status = 'concluido'
           ORDER BY concluido_em DESC LIMIT 1
         ) AS ultimo
       ), '')`,
    [limite],
  );
  return r.affectedRows;
}

// ── Robô ──────────────────────────────────────────────────────────

export async function registrarHeartbeat(host: string, versao: string | null, agora: Date): Promise<void> {
  await getPool().query(
    `INSERT INTO au_robot_heartbeat (host, versao, visto_em) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE versao = VALUES(versao), visto_em = VALUES(visto_em)`,
    [host, versao, agora],
  );
}

export async function buscarUltimoHeartbeat(): Promise<HeartbeatRow | null> {
  const [rows] = await getPool().query<HeartbeatRow[]>(
    `SELECT host, versao, visto_em FROM au_robot_heartbeat ORDER BY visto_em DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

// ── Pastas, vínculos e empresas ───────────────────────────────────

export async function listarPastasDoJob(jobId: string): Promise<PastaDoJobRow[]> {
  const [rows] = await getPool().query<PastaDoJobRow[]>(
    `SELECT f.nome_pasta, f.subpastas_contrato, f.erro, COUNT(a.id) AS arquivos
     FROM au_folders f
     LEFT JOIN au_files a ON a.folder_id = f.id
     WHERE f.job_id = ?
     GROUP BY f.id, f.nome_pasta, f.subpastas_contrato, f.erro`,
    [jobId],
  );
  return rows.map((r) => ({ ...r, arquivos: Number(r.arquivos) }));
}

export async function listarVinculos(): Promise<VinculoRow[]> {
  const [rows] = await getPool().query<VinculoRow[]>(
    `SELECT nome_pasta, company_id, tipo FROM au_folder_links`,
  );
  return rows;
}

export async function listarEmpresas(): Promise<EmpresaRow[]> {
  const [rows] = await getPool().query<EmpresaRow[]>(
    `SELECT id, razao_social, cnpj, responsavel, inativo FROM companies`,
  );
  return rows;
}

// ── Empresas sem pasta (migration 004) ────────────────────────────

export async function listarMarcasSemPasta(): Promise<MarcaSemPastaRow[]> {
  const [rows] = await getPool().query<MarcaSemPastaRow[]>(
    `SELECT company_id, motivo, marcado_em FROM au_empresas_sem_pasta`,
  );
  return rows;
}

export async function marcarSemPasta(companyId: string, motivo: string | null, agora: Date): Promise<void> {
  await getPool().query(
    `INSERT INTO au_empresas_sem_pasta (company_id, motivo, marcado_em) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE motivo = VALUES(motivo), marcado_em = VALUES(marcado_em)`,
    [companyId, motivo, agora],
  );
}

export async function desmarcarSemPasta(companyId: string): Promise<void> {
  await getPool().query(`DELETE FROM au_empresas_sem_pasta WHERE company_id = ?`, [companyId]);
}

export async function empresaExiste(id: string): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(`SELECT 1 FROM companies WHERE id = ?`, [id]);
  return rows.length > 0;
}

/** Grava vínculos automáticos sem tocar nos que já existem (confirmados e ignorados ficam como estão). */
export async function inserirVinculosAutomaticos(
  pares: { nomePasta: string; companyId: string }[],
  agora: Date,
): Promise<void> {
  if (!pares.length) return;
  await getPool().query(
    `INSERT IGNORE INTO au_folder_links (nome_pasta, company_id, tipo, vinculado_em) VALUES ?`,
    [pares.map((p) => [normalizarNomePasta(p.nomePasta), p.companyId, 'auto', agora])],
  );
}

export async function salvarVinculo(
  nomePasta: string,
  companyId: string | null,
  tipo: Exclude<TipoVinculo, 'auto'>,
  agora: Date,
): Promise<void> {
  await getPool().query(
    `INSERT INTO au_folder_links (nome_pasta, company_id, tipo, vinculado_em) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE company_id = VALUES(company_id), tipo = VALUES(tipo), vinculado_em = VALUES(vinculado_em)`,
    [normalizarNomePasta(nomePasta), companyId, tipo, agora],
  );
}

export async function removerVinculo(nomePasta: string): Promise<void> {
  await getPool().query(`DELETE FROM au_folder_links WHERE nome_pasta = ?`, [normalizarNomePasta(nomePasta)]);
}
