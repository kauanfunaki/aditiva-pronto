import { RowDataPacket } from 'mysql2';
import { v4 as uuidv4 } from 'uuid';
import { getPool } from '../database/connection';

// Datas sempre vêm do app (o pool grava em UTC); nada de NOW() do servidor MySQL.

export interface Conta {
  id:        string;
  login:     string;
  nome:      string;
  ativo:     boolean;
  senhaHash: string;
}

interface ContaRow extends RowDataPacket {
  id:         string;
  login:      string;
  nome:       string;
  ativo:      number;
  senha_hash: string;
}

export async function buscarContaPorLogin(login: string): Promise<Conta | null> {
  const [rows] = await getPool().query<ContaRow[]>(
    `SELECT id, login, nome, ativo, senha_hash FROM ap_usuarios WHERE login = ? LIMIT 1`,
    [login],
  );
  const r = rows[0];
  return r ? { id: r.id, login: r.login, nome: r.nome, ativo: r.ativo === 1, senhaHash: r.senha_hash } : null;
}

export async function inserirConta(dados: { login: string; nome: string; senhaHash: string; agora: Date }): Promise<string> {
  const id = uuidv4();
  await getPool().query(
    `INSERT INTO ap_usuarios (id, login, nome, senha_hash, ativo, criado_em, atualizado_em)
     VALUES (?, ?, ?, ?, 1, ?, ?)`,
    [id, dados.login, dados.nome, dados.senhaHash, dados.agora, dados.agora],
  );
  return id;
}

export async function gravarSenha(id: string, senhaHash: string, agora: Date): Promise<void> {
  await getPool().query(
    `UPDATE ap_usuarios SET senha_hash = ?, ativo = 1, atualizado_em = ? WHERE id = ?`,
    [senhaHash, agora, id],
  );
}

export async function marcarLogin(id: string, agora: Date): Promise<void> {
  await getPool().query(`UPDATE ap_usuarios SET ultimo_login_em = ? WHERE id = ?`, [agora, id]);
}

// ── Sessões (várias por conta: a mesma conta aberta em vários PCs) ─

export async function criarSessao(dados: {
  id: string; usuarioId: string; agora: Date; expiraEm: Date; ip: string | null; userAgent: string | null;
}): Promise<void> {
  await getPool().query(
    `INSERT INTO ap_sessoes (id, usuario_id, criada_em, expira_em, ip, user_agent) VALUES (?, ?, ?, ?, ?, ?)`,
    [dados.id, dados.usuarioId, dados.agora, dados.expiraEm, dados.ip?.slice(0, 64) ?? null, dados.userAgent?.slice(0, 300) ?? null],
  );
}

interface SessaoRow extends RowDataPacket {
  sessao_id: string;
  id:        string;
  login:     string;
  nome:      string;
}

/** Conta ativa dona da sessão ainda válida, ou null. */
export async function buscarContaDaSessao(sessaoId: string, agora: Date) {
  const [rows] = await getPool().query<SessaoRow[]>(
    `SELECT s.id AS sessao_id, u.id, u.login, u.nome
       FROM ap_sessoes s
       JOIN ap_usuarios u ON u.id = s.usuario_id
      WHERE s.id = ? AND s.expira_em > ? AND u.ativo = 1
      LIMIT 1`,
    [sessaoId, agora],
  );
  const r = rows[0];
  return r ? { id: r.id, login: r.login, nome: r.nome, sessaoId: r.sessao_id } : null;
}

export async function apagarSessao(sessaoId: string): Promise<void> {
  await getPool().query(`DELETE FROM ap_sessoes WHERE id = ?`, [sessaoId]);
}

export async function apagarSessoesDaConta(usuarioId: string): Promise<number> {
  const [r] = await getPool().query(`DELETE FROM ap_sessoes WHERE usuario_id = ?`, [usuarioId]);
  return (r as { affectedRows: number }).affectedRows;
}

export async function apagarSessoesVencidas(agora: Date): Promise<void> {
  await getPool().query(`DELETE FROM ap_sessoes WHERE expira_em <= ?`, [agora]);
}
