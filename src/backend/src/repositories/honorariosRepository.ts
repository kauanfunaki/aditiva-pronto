// Honorários (migration 008): valor informado à mão, leitura do Acessórias e envios.
// Datas sempre vêm do app (o pool grava em UTC).

import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../database/connection';

// ── Valor informado à mão ─────────────────────────────────────────

export type OrigemManual = 'digitado' | 'acessorias';

export interface ManualRow extends RowDataPacket {
  company_id:    string;
  valor:         string;
  documento:     string | null;
  observacao:    string | null;
  origem:        OrigemManual;
  informado_por: string;
  informado_em:  Date;
}

export async function listarManuais(): Promise<ManualRow[]> {
  const [rows] = await getPool().query<ManualRow[]>(
    `SELECT company_id, valor, documento, observacao, origem, informado_por, informado_em FROM au_honorarios_manuais`,
  );
  return rows;
}

export async function gravarManual(d: {
  companyId: string; valor: number; documento: string | null; observacao: string | null; origem: OrigemManual;
  conta: string; agora: Date;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO au_honorarios_manuais (company_id, valor, documento, observacao, origem, informado_por, informado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE valor = VALUES(valor), documento = VALUES(documento), observacao = VALUES(observacao),
       origem = VALUES(origem), informado_por = VALUES(informado_por), informado_em = VALUES(informado_em)`,
    [d.companyId, d.valor.toFixed(2), d.documento, d.observacao, d.origem, d.conta, d.agora],
  );
}

export async function apagarManual(companyId: string): Promise<void> {
  await getPool().query(`DELETE FROM au_honorarios_manuais WHERE company_id = ?`, [companyId]);
}

export async function empresaAtiva(companyId: string): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT 1 FROM companies WHERE id = ? AND inativo = 0 LIMIT 1`,
    [companyId],
  );
  return rows.length > 0;
}

/** CNPJ da empresa ativa; null se não existe ou está inativa. */
export async function cnpjDaEmpresaAtiva(companyId: string): Promise<string | null> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT cnpj FROM companies WHERE id = ? AND inativo = 0 LIMIT 1`,
    [companyId],
  );
  return rows.length ? String(rows[0].cnpj) : null;
}

// ── Leitura do Acessórias ─────────────────────────────────────────

export interface AcessoriasEmpresaRow extends RowDataPacket {
  cnpj_digitos:  string;
  identificador: string;
  acessorias_id: string | null;
  razao:         string | null;
  situacao:      string | null;
  honorario:     string | null;
  lido_em:       Date;
}

export interface AcessoriasEmpresa {
  cnpjDigitos:   string;
  identificador: string;
  acessoriasId:  string | null;
  razao:         string | null;
  situacao:      string | null;
  honorario:     number | null;
}

export async function acessoriasDoCnpj(cnpjDigitos: string): Promise<AcessoriasEmpresaRow | null> {
  const [rows] = await getPool().query<AcessoriasEmpresaRow[]>(
    `SELECT cnpj_digitos, identificador, acessorias_id, razao, situacao, honorario, lido_em
     FROM au_acessorias_empresas WHERE cnpj_digitos = ? LIMIT 1`,
    [cnpjDigitos],
  );
  return rows[0] ?? null;
}

export async function listarAcessorias(): Promise<AcessoriasEmpresaRow[]> {
  const [rows] = await getPool().query<AcessoriasEmpresaRow[]>(
    `SELECT cnpj_digitos, identificador, acessorias_id, razao, situacao, honorario, lido_em FROM au_acessorias_empresas`,
  );
  return rows;
}

const linhaAcessorias = (e: AcessoriasEmpresa, agora: Date) => [
  e.cnpjDigitos, e.identificador.slice(0, 20), e.acessoriasId?.slice(0, 20) ?? null, e.razao?.slice(0, 300) ?? null,
  e.situacao?.slice(0, 50) ?? null, e.honorario === null ? null : e.honorario.toFixed(2), agora,
];

/** Troca a leitura inteira (o que sumiu do Acessórias some daqui também). */
export async function substituirAcessorias(empresas: AcessoriasEmpresa[], agora: Date): Promise<void> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(`DELETE FROM au_acessorias_empresas`);
    for (let i = 0; i < empresas.length; i += 500) {
      const lote = empresas.slice(i, i + 500).map((e) => linhaAcessorias(e, agora));
      await conn.query(
        `INSERT INTO au_acessorias_empresas
           (cnpj_digitos, identificador, acessorias_id, razao, situacao, honorario, lido_em)
         VALUES ? ON DUPLICATE KEY UPDATE identificador = VALUES(identificador)`,
        [lote],
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function gravarAcessoriasUma(e: AcessoriasEmpresa, agora: Date): Promise<void> {
  await getPool().query(
    `INSERT INTO au_acessorias_empresas
       (cnpj_digitos, identificador, acessorias_id, razao, situacao, honorario, lido_em)
     VALUES (?)
     ON DUPLICATE KEY UPDATE identificador = VALUES(identificador), acessorias_id = VALUES(acessorias_id),
       razao = VALUES(razao), situacao = VALUES(situacao), honorario = VALUES(honorario), lido_em = VALUES(lido_em)`,
    [linhaAcessorias(e, agora)],
  );
}

// ── Envios ────────────────────────────────────────────────────────

export interface NovoEnvio {
  companyId:     string;
  cnpjDigitos:   string;
  razaoSocial:   string;
  valorAnterior: number | null;
  valorEnviado:  number;
  fonte:         'documento' | 'manual';
  documento:     string | null;
  conta:         string;
  ip:            string | null;
  status:        'ok' | 'erro';
  erro:          string | null;
  outrosCampos:  string[] | null;
  fichaAntes:    unknown;
  fichaDepois:   unknown;
  agora:         Date;
}

export async function registrarEnvio(e: NovoEnvio): Promise<string> {
  const id = uuidv4();
  await getPool().query(
    `INSERT INTO au_acessorias_envios
       (id, company_id, cnpj_digitos, razao_social, valor_anterior, valor_enviado, fonte, documento, conta, ip,
        status, erro, outros_campos, ficha_antes, ficha_depois, enviado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, e.companyId, e.cnpjDigitos, e.razaoSocial.slice(0, 300),
      e.valorAnterior === null ? null : e.valorAnterior.toFixed(2), e.valorEnviado.toFixed(2),
      e.fonte, e.documento?.slice(0, 1000) ?? null, e.conta.slice(0, 100), e.ip?.slice(0, 64) ?? null,
      e.status, e.erro?.slice(0, 1000) ?? null,
      e.outrosCampos?.length ? JSON.stringify(e.outrosCampos) : null,
      e.fichaAntes === undefined ? null : JSON.stringify(e.fichaAntes),
      e.fichaDepois === undefined ? null : JSON.stringify(e.fichaDepois),
      e.agora,
    ],
  );
  return id;
}

export interface EnvioRow extends RowDataPacket {
  id:             string;
  company_id:     string;
  cnpj_digitos:   string;
  razao_social:   string;
  valor_anterior: string | null;
  valor_enviado:  string;
  fonte:          'documento' | 'manual';
  documento:      string | null;
  conta:          string;
  status:         'ok' | 'erro';
  erro:           string | null;
  outros_campos:  string[] | string | null;
  enviado_em:     Date;
  conferido_em:   Date | null;
  conferido_por:  string | null;
}

const COLUNAS_ENVIO = `id, company_id, cnpj_digitos, razao_social, valor_anterior, valor_enviado, fonte, documento,
  conta, status, erro, outros_campos, enviado_em, conferido_em, conferido_por`;

export async function listarEnvios(limite: number): Promise<EnvioRow[]> {
  const [rows] = await getPool().query<EnvioRow[]>(
    `SELECT ${COLUNAS_ENVIO} FROM au_acessorias_envios ORDER BY enviado_em DESC LIMIT ?`,
    [limite],
  );
  return rows;
}

/** Último envio de cada empresa. */
export async function ultimosEnviosPorEmpresa(): Promise<EnvioRow[]> {
  const [rows] = await getPool().query<EnvioRow[]>(
    `SELECT ${COLUNAS_ENVIO} FROM au_acessorias_envios e
     WHERE e.enviado_em = (SELECT MAX(x.enviado_em) FROM au_acessorias_envios x WHERE x.company_id = e.company_id)`,
  );
  return rows;
}

/** Envio que mexeu em outro campo e ninguém conferiu ainda: trava os próximos. */
export async function buscarBloqueio(): Promise<(EnvioRow & { ficha_antes: unknown; ficha_depois: unknown }) | null> {
  const [rows] = await getPool().query<(EnvioRow & { ficha_antes: unknown; ficha_depois: unknown })[]>(
    `SELECT ${COLUNAS_ENVIO}, ficha_antes, ficha_depois FROM au_acessorias_envios
     WHERE outros_campos IS NOT NULL AND conferido_em IS NULL
     ORDER BY enviado_em DESC LIMIT 1`,
  );
  return rows[0] ?? null;
}

/** Já houve um envio que confirmou o valor sem mexer em mais nada? (libera o envio em lote) */
export async function existeEnvioLimpo(): Promise<boolean> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    `SELECT 1 FROM au_acessorias_envios WHERE status = 'ok' AND outros_campos IS NULL LIMIT 1`,
  );
  return rows.length > 0;
}

export async function marcarConferido(id: string, conta: string, agora: Date): Promise<boolean> {
  const [r] = await getPool().query(
    `UPDATE au_acessorias_envios SET conferido_em = ?, conferido_por = ? WHERE id = ? AND conferido_em IS NULL`,
    [agora, conta.slice(0, 100), id],
  );
  return (r as { affectedRows: number }).affectedRows > 0;
}
