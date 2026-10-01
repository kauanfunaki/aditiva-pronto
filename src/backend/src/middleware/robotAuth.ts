import { createHash, timingSafeEqual } from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';

/** Tamanho mínimo do AUDIT_ROBOT_TOKEN. Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))" */
export const TAMANHO_MINIMO_TOKEN = 32;

/** Compara em tempo constante (o hash iguala o tamanho dos dois lados). */
export function tokenConfere(recebido: string, esperado: string): boolean {
  const a = createHash('sha256').update(recebido).digest();
  const b = createHash('sha256').update(esperado).digest();
  return timingSafeEqual(a, b);
}

/**
 * Protege as rotas do robô coletor (`/api/audit/robot/*`).
 * O resto do app não tem login (ADR-006), mas só o robô pode gravar inventário.
 * Sem token configurado no servidor, recusa tudo (falha fechada).
 */
export function robotAuth(req: Request, _res: Response, next: NextFunction): void {
  const esperado = process.env.AUDIT_ROBOT_TOKEN ?? '';
  if (esperado.length < TAMANHO_MINIMO_TOKEN) {
    next(new AppError(503, 'Robô da auditoria não configurado no servidor (AUDIT_ROBOT_TOKEN ausente ou curto).'));
    return;
  }

  const header   = req.get('authorization') ?? '';
  const recebido = header.startsWith('Bearer ') ? header.slice('Bearer '.length).trim() : '';
  if (!recebido || !tokenConfere(recebido, esperado)) {
    next(new AppError(401, 'Token do robô inválido.'));
    return;
  }
  next();
}
