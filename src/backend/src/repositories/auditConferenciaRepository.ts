// Conferência manual da auditoria (migration 011): situação Resolvido/Pendente e
// comentário por empresa, em Contratos (ano 0) e em Aditivos (por ano de referência).

import { RowDataPacket } from 'mysql2';
import { getPool } from '../database/connection';

export type ModuloConferencia = 'contratos' | 'aditivos';
export type SituacaoConferencia = 'pendente' | 'resolvido';

export interface ConferenciaRow extends RowDataPacket {
  company_id:     string;
  situacao:       SituacaoConferencia;
  comentario:     string | null;
  atualizado_por: string;
  atualizado_em:  Date;
}

export async function listarConferencias(modulo: ModuloConferencia, ano: number): Promise<ConferenciaRow[]> {
  const [rows] = await getPool().query<ConferenciaRow[]>(
    `SELECT company_id, situacao, comentario, atualizado_por, atualizado_em
     FROM au_conferencias
     WHERE modulo = ? AND ano = ?`,
    [modulo, ano],
  );
  return rows;
}

export async function salvarConferencia(c: {
  companyId: string; modulo: ModuloConferencia; ano: number;
  situacao: SituacaoConferencia; comentario: string | null; por: string; agora: Date;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO au_conferencias (company_id, modulo, ano, situacao, comentario, atualizado_por, atualizado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE situacao = VALUES(situacao), comentario = VALUES(comentario),
                             atualizado_por = VALUES(atualizado_por), atualizado_em = VALUES(atualizado_em)`,
    [c.companyId, c.modulo, c.ano, c.situacao, c.comentario, c.por, c.agora],
  );
}

/** Pendente e sem comentário é o mesmo que não ter linha: apaga para não acumular. */
export async function apagarConferencia(companyId: string, modulo: ModuloConferencia, ano: number): Promise<void> {
  await getPool().query(
    `DELETE FROM au_conferencias WHERE company_id = ? AND modulo = ? AND ano = ?`,
    [companyId, modulo, ano],
  );
}
