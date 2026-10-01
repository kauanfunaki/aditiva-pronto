// Auditoria Aditivos (Fase 2A) — leituras do banco.
// Mesmas regras da base (auditRepository): sem JOIN com `companies` e horários
// passados como Date do app (UTC).

import { RowDataPacket } from 'mysql2';
import { getPool } from '../database/connection';

export interface ArquivoDoJobRow extends RowDataPacket {
  nome_pasta:       string;
  caminho_relativo: string;
  nome:             string;
  ext:              string;
  tamanho:          number;
  modificado_em:    Date;
  pdf_assinado:     number | null;
  pdf_marca:        string | null;
}

export async function listarArquivosDoJob(jobId: string): Promise<ArquivoDoJobRow[]> {
  const [rows] = await getPool().query<ArquivoDoJobRow[]>(
    `SELECT f.nome_pasta, a.caminho_relativo, a.nome, a.ext, a.tamanho,
            a.modificado_em, a.pdf_assinado, a.pdf_marca
     FROM au_files a
     JOIN au_folders f ON f.id = a.folder_id
     WHERE a.job_id = ?`,
    [jobId],
  );
  return rows;
}

export interface EmpresaAtivaRow extends RowDataPacket {
  id:           string;
  razao_social: string;
  cnpj:         string;
  responsavel:  string | null;
}

export async function listarEmpresasAtivas(): Promise<EmpresaAtivaRow[]> {
  const [rows] = await getPool().query<EmpresaAtivaRow[]>(
    `SELECT id, razao_social, cnpj, responsavel FROM companies WHERE inativo = 0`,
  );
  return rows;
}

interface GeradosRow extends RowDataPacket {
  company_id: string;
  qtd:        number;
  ultimo:     Date;
}

/** Termos aditivos gerados pelo próprio app, por empresa, no intervalo [inicio, fim). */
export async function contarGeradosNoApp(
  inicio: Date,
  fim: Date,
): Promise<Map<string, { qtd: number; ultimo: Date }>> {
  const [rows] = await getPool().query<GeradosRow[]>(
    `SELECT company_id, COUNT(*) AS qtd, MAX(generated_at) AS ultimo
     FROM generated_documents
     WHERE generated_at >= ? AND generated_at < ?
     GROUP BY company_id`,
    [inicio, fim],
  );
  return new Map(rows.map((r) => [r.company_id, { qtd: Number(r.qtd), ultimo: r.ultimo }]));
}
