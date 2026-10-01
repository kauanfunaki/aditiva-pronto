import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import {
  concluirSchema, falharSchema, loteSchema, marcaSemPastaSchema, proximoJobSchema,
  resumirErroZod, vincularPastaSchema,
} from '../services/auditPayload';
import * as audit from '../services/auditSyncService';

function validar<T extends z.ZodTypeAny>(schema: T, dados: unknown): z.infer<T> {
  const r = schema.safeParse(dados);
  if (!r.success) throw new AppError(400, `Dados inválidos — ${resumirErroZod(r.error)}`);
  return r.data;
}

const jobIdSchema = z.string().uuid();

function jobIdDe(req: Request): string {
  const r = jobIdSchema.safeParse(req.params.id);
  if (!r.success) throw new AppError(400, 'Id de job inválido.');
  return r.data;
}

// ── Tela ──────────────────────────────────────────────────────────

// GET /api/audit/status
export async function getStatus(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await audit.obterStatus());
  } catch (err) { next(err); }
}

// POST /api/audit/sync
export async function postSync(_req: Request, res: Response, next: NextFunction) {
  try {
    const r = await audit.solicitarSincronizacao('manual');
    res.status(r.criado ? 201 : 200).json(r);
  } catch (err) { next(err); }
}

// GET /api/audit/folders
export async function getFolders(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await audit.listarPastas());
  } catch (err) { next(err); }
}

// PUT /api/audit/folders/link
export async function putFolderLink(req: Request, res: Response, next: NextFunction) {
  try {
    await audit.alterarVinculo(validar(vincularPastaSchema, req.body));
    res.json({ message: 'Vínculo atualizado.' });
  } catch (err) { next(err); }
}

// PUT /api/audit/companies/sem-pasta
export async function putEmpresaSemPasta(req: Request, res: Response, next: NextFunction) {
  try {
    await audit.alterarMarcaSemPasta(validar(marcaSemPastaSchema, req.body));
    res.json({ message: 'Empresa atualizada.' });
  } catch (err) { next(err); }
}

// ── Robô (protegido por robotAuth) ────────────────────────────────

// POST /api/audit/robot/next-job
export async function postNextJob(req: Request, res: Response, next: NextFunction) {
  try {
    const { host, versao } = validar(proximoJobSchema, req.body);
    const trabalho = await audit.proximoTrabalho(host, versao ?? null);
    if (!trabalho) {
      res.status(204).end();
      return;
    }
    res.json(trabalho);
  } catch (err) { next(err); }
}

// POST /api/audit/robot/jobs/:id/folders
export async function postLote(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = jobIdDe(req);
    const lote  = validar(loteSchema, req.body);
    await audit.receberLote(jobId, lote);
    res.json({ recebidas: lote.pastas.length });
  } catch (err) { next(err); }
}

// POST /api/audit/robot/jobs/:id/finish
export async function postFinish(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = jobIdDe(req);
    const { totais } = validar(concluirSchema, req.body);
    res.json(await audit.concluir(jobId, totais));
  } catch (err) { next(err); }
}

// POST /api/audit/robot/jobs/:id/fail
export async function postFail(req: Request, res: Response, next: NextFunction) {
  try {
    const jobId = jobIdDe(req);
    const { erro } = validar(falharSchema, req.body);
    await audit.falhar(jobId, erro);
    res.json({ message: 'Falha registrada.' });
  } catch (err) { next(err); }
}
