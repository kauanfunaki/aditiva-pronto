import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { robotAuth, tokenConfere } from './robotAuth';
import { AppError } from './errorHandler';

const TOKEN = 'a'.repeat(64);

function chamar(authorization?: string): unknown {
  const req  = { get: (h: string) => (h.toLowerCase() === 'authorization' ? authorization : undefined) } as Request;
  const next = vi.fn();
  robotAuth(req, {} as Response, next);
  expect(next).toHaveBeenCalledTimes(1);
  return next.mock.calls[0][0];
}

afterEach(() => {
  delete process.env.AUDIT_ROBOT_TOKEN;
});

describe('tokenConfere', () => {
  it('compara tokens de tamanhos diferentes sem lançar', () => {
    expect(tokenConfere(TOKEN, TOKEN)).toBe(true);
    expect(tokenConfere('curto', TOKEN)).toBe(false);
    expect(tokenConfere('', TOKEN)).toBe(false);
  });
});

describe('robotAuth', () => {
  it('recusa tudo quando o servidor não tem token configurado', () => {
    const err = chamar(`Bearer ${TOKEN}`);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).statusCode).toBe(503);
  });

  it('recusa token curto configurado no servidor', () => {
    process.env.AUDIT_ROBOT_TOKEN = 'curto';
    expect((chamar('Bearer curto') as AppError).statusCode).toBe(503);
  });

  it('recusa sem header, com esquema errado ou com token errado', () => {
    process.env.AUDIT_ROBOT_TOKEN = TOKEN;
    expect((chamar() as AppError).statusCode).toBe(401);
    expect((chamar(TOKEN) as AppError).statusCode).toBe(401);
    expect((chamar(`Basic ${TOKEN}`) as AppError).statusCode).toBe(401);
    expect((chamar(`Bearer ${'b'.repeat(64)}`) as AppError).statusCode).toBe(401);
  });

  it('deixa passar com o token certo', () => {
    process.env.AUDIT_ROBOT_TOKEN = TOKEN;
    expect(chamar(`Bearer ${TOKEN}`)).toBeUndefined();
  });
});
