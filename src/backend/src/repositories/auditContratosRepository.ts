// Auditoria Contratos (Fase 2B) — leituras isoladas do módulo.

import { RowDataPacket } from 'mysql2';
import { getPool } from '../database/connection';

export interface ArquivoContratoRow extends RowDataPacket {
  nome_pasta:       string;
  caminho_relativo: string;
  nome:             string;
  ext:              string;
  tamanho:          number;
  modificado_em:    Date;
  pdf_assinado:     number | null;
  pdf_marca:        string | null;
}

export async function listarArquivosDoJob(jobId: string): Promise<ArquivoContratoRow[]> {
  const [rows] = await getPool().query<ArquivoContratoRow[]>(
    `SELECT f.nome_pasta, a.caminho_relativo, a.nome, a.ext, a.tamanho,
            a.modificado_em, a.pdf_assinado, a.pdf_marca
     FROM au_files a
     JOIN au_folders f ON f.id = a.folder_id
     WHERE a.job_id = ?`,
    [jobId],
  );
  return rows;
}

export interface EmpresaContratoRow extends RowDataPacket {
  id:           string;
  razao_social: string;
  cnpj:         string;
  responsavel:  string | null;
}

export async function listarEmpresasAtivas(): Promise<EmpresaContratoRow[]> {
  const [rows] = await getPool().query<EmpresaContratoRow[]>(
    `SELECT id, razao_social, cnpj, responsavel FROM companies WHERE inativo = 0`,
  );
  return rows;
}
