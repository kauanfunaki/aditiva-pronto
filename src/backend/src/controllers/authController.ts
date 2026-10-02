import { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/errorHandler';
import {
  apagarCookie, gravarCookie, idDaSessao, lerCookie, nomeDoCookie, origemConfiavel,
} from '../middleware/sessao';
import { resumirErroZod } from '../services/auditPayload';
import * as auth from '../services/authService';

// POST /api/auth/login
export async function postLogin(req: Request, res: Response, next: NextFunction) {
  try {
    if (!origemConfiavel(req)) throw new AppError(403, 'Pedido recusado: origem não reconhecida.');
    const r = auth.loginSchema.safeParse(req.body);
    if (!r.success) throw new AppError(400, resumirErroZod(r.error));
    const { token, usuario } = await auth.entrar({
      ...r.data, ip: req.ip ?? null, userAgent: req.get('user-agent') ?? null,
    });
    gravarCookie(res, token);
    res.json({ usuario });
  } catch (err) { next(err); }
}

// POST /api/auth/logout — funciona mesmo com a sessão já vencida.
// Só encerra ESTE navegador: os colegas na mesma conta continuam logados.
export async function postLogout(req: Request, res: Response, next: NextFunction) {
  try {
    if (!origemConfiavel(req)) throw new AppError(403, 'Pedido recusado: origem não reconhecida.');
    const token = lerCookie(req.headers.cookie, nomeDoCookie());
    if (token) await auth.sair(idDaSessao(token));
    apagarCookie(res);
    res.status(204).end();
  } catch (err) { next(err); }
}

// GET /api/auth/me
export function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.usuario) throw new AppError(401, 'Entre com a conta do seu setor para continuar.');
    const { sessaoId: _sessao, ...usuario } = req.usuario;
    res.json({ usuario });
  } catch (err) { next(err); }
}
