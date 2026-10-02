// Login por cookie de sessão. O robô da auditoria não passa por aqui (usa robotAuth).

import { createHash, randomBytes } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { buscarContaDaSessao } from '../repositories/usuariosRepository';

/** Conta compartilhada do setor (Societário, Controladoria). Sem perfis. */
export interface UsuarioLogado {
  id:       string;
  login:    string;
  nome:     string;
  sessaoId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      usuario?: UsuarioLogado;
    }
  }
}

export const DURACAO_SESSAO_MS = 12 * 60 * 60 * 1000; // um expediente

const PRODUCAO = () => process.env.NODE_ENV === 'production';

/** Em produção o prefixo __Host- obriga Secure, Path=/ e nenhum Domain. */
export function nomeDoCookie(): string {
  return PRODUCAO() ? '__Host-ap_sessao' : 'ap_sessao';
}

export function novoTokenDeSessao(): { token: string; id: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, id: idDaSessao(token) };
}

/** O banco guarda só o SHA-256 do token. */
export function idDaSessao(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function lerCookie(cabecalho: string | undefined, nome: string): string | null {
  if (!cabecalho) return null;
  for (const parte of cabecalho.split(';')) {
    const i = parte.indexOf('=');
    if (i < 0) continue;
    if (parte.slice(0, i).trim() !== nome) continue;
    const valor = parte.slice(i + 1).trim();
    return /^[A-Za-z0-9_-]{20,100}$/.test(valor) ? valor : null;
  }
  return null;
}

export function gravarCookie(res: Response, token: string): void {
  const partes = [
    `${nomeDoCookie()}=${token}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${Math.floor(DURACAO_SESSAO_MS / 1000)}`,
  ];
  if (PRODUCAO()) partes.push('Secure');
  res.append('Set-Cookie', partes.join('; '));
}

export function apagarCookie(res: Response): void {
  const partes = [`${nomeDoCookie()}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', 'Max-Age=0'];
  if (PRODUCAO()) partes.push('Secure');
  res.append('Set-Cookie', partes.join('; '));
}

const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Defesa contra CSRF além do SameSite=Strict: pedido que muda dado só vale se
 * o navegador disser que veio do próprio site. Sem esses cabeçalhos (curl,
 * script) não há cookie de vítima para abusar, então passa.
 */
export function origemConfiavel(req: Pick<Request, 'method' | 'get'>): boolean {
  if (METODOS_SEGUROS.has(req.method.toUpperCase())) return true;

  const site = req.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'none';

  const origem = req.get('origin');
  if (!origem) return true;
  let host: string;
  try {
    host = new URL(origem).host;
  } catch {
    return false;
  }
  const permitidos = new Set([req.get('host') ?? '']);
  for (const o of (process.env.APP_ORIGIN ?? '').split(',').map((s) => s.trim()).filter(Boolean)) {
    try { permitidos.add(new URL(o).host); } catch { /* ignora entrada inválida */ }
  }
  return permitidos.has(host);
}

export async function exigirUsuario(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!origemConfiavel(req)) throw new AppError(403, 'Pedido recusado: origem não reconhecida.');

    const token = lerCookie(req.headers.cookie, nomeDoCookie());
    if (!token) throw new AppError(401, 'Entre com a conta do seu setor para continuar.');

    const usuario = await buscarContaDaSessao(idDaSessao(token), new Date());
    if (!usuario) {
      apagarCookie(res);
      throw new AppError(401, 'Sua sessão terminou. Entre de novo.');
    }
    req.usuario = usuario;
    next();
  } catch (err) {
    next(err);
  }
}
