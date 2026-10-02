import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { resumirErroZod } from '../services/auditPayload';
import * as honorarios from '../services/honorariosService';
import * as acessorias from '../services/acessoriasService';

function validar<T extends z.ZodTypeAny>(schema: T, dados: unknown): z.infer<T> {
  const r = schema.safeParse(dados);
  if (!r.success) throw new AppError(400, `Dados inválidos — ${resumirErroZod(r.error)}`);
  return r.data;
}

function conta(req: Request): string {
  if (!req.usuario) throw new AppError(401, 'Entre com a conta do seu setor para continuar.');
  return req.usuario.login;
}

const idEmpresa = z.string().uuid('Empresa inválida.');
const valorEmReais = z.number().finite().min(10, 'Valor muito baixo.').max(999_999.99, 'Valor muito alto.')
  .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, 'Use no máximo 2 casas decimais.');

const manualSchema = z.object({
  valor:      valorEmReais,
  documento:  z.string().trim().max(1000).optional().transform((s) => s || null),
  observacao: z.string().trim().max(300).optional().transform((s) => s || null),
});

const envioSchema = z.object({
  companyId:     idEmpresa,
  valorEsperado: valorEmReais,
});

const loteSchema = z.object({
  itens: z.array(envioSchema).min(1).max(1000),
});

// GET /api/honorarios
export async function getRelatorio(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await honorarios.montarRelatorioHonorarios());
  } catch (err) { next(err); }
}

// PUT /api/honorarios/:companyId/manual
export async function putManual(req: Request, res: Response, next: NextFunction) {
  try {
    const companyId = validar(idEmpresa, req.params.companyId);
    await honorarios.informarValor(conta(req), { companyId, ...validar(manualSchema, req.body) });
    res.json({ message: 'Valor informado.' });
  } catch (err) { next(err); }
}

// DELETE /api/honorarios/:companyId/manual
export async function deleteManual(req: Request, res: Response, next: NextFunction) {
  try {
    await honorarios.removerValorInformado(validar(idEmpresa, req.params.companyId));
    res.json({ message: 'Valor informado removido.' });
  } catch (err) { next(err); }
}

// GET /api/honorarios/acessorias
export async function getEstadoAcessorias(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await acessorias.estado());
  } catch (err) { next(err); }
}

// POST /api/honorarios/acessorias/conferir
export function postConferir(req: Request, res: Response, next: NextFunction) {
  try {
    res.status(202).json(acessorias.conferirTudo(conta(req)));
  } catch (err) { next(err); }
}

// POST /api/honorarios/acessorias/enviar
export async function postEnviar(req: Request, res: Response, next: NextFunction) {
  try {
    const { companyId, valorEsperado } = validar(envioSchema, req.body);
    res.json(await acessorias.enviarUma(conta(req), req.ip ?? null, companyId, valorEsperado));
  } catch (err) { next(err); }
}

// POST /api/honorarios/acessorias/enviar-lote
export async function postEnviarLote(req: Request, res: Response, next: NextFunction) {
  try {
    const { itens } = validar(loteSchema, req.body);
    res.status(202).json(await acessorias.enviarLote(conta(req), req.ip ?? null, itens));
  } catch (err) { next(err); }
}

// GET /api/honorarios/acessorias/envios
export async function getEnvios(req: Request, res: Response, next: NextFunction) {
  try {
    const limite = Math.min(500, Math.max(1, Number(req.query.limite) || 100));
    res.json({ data: await acessorias.listarEnvios(limite) });
  } catch (err) { next(err); }
}

// POST /api/honorarios/acessorias/envios/:id/conferido
export async function postConferido(req: Request, res: Response, next: NextFunction) {
  try {
    await acessorias.liberarEnvios(conta(req), validar(z.string().uuid(), req.params.id));
    res.json({ message: 'Envios liberados.' });
  } catch (err) { next(err); }
}
