import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { resumirErroZod } from '../services/auditPayload';
import { STATUS_ADITIVO } from '../services/auditAditivosStatus';
import {
  anoAtual, filtrarEmpresas, gerarXlsxAditivos, montarRelatorioAditivos,
} from '../services/auditAditivosService';

const anoSchema = z.coerce.number().int().min(2015).max(2100).optional();

const filtrosSchema = z.object({
  ano:         anoSchema,
  status:      z.enum([...STATUS_ADITIVO, 'em_dia', 'pendente']).optional(),
  responsavel: z.string().trim().max(100).optional(),
  busca:       z.string().trim().max(200).optional(),
  alerta:      z.enum(['1']).optional(),
});

function lerFiltros(query: unknown) {
  const r = filtrosSchema.safeParse(query);
  if (!r.success) throw new AppError(400, `Parâmetros inválidos — ${resumirErroZod(r.error)}`);
  return { ...r.data, ano: r.data.ano ?? anoAtual() };
}

// GET /api/audit/aditivos?ano=2026
export async function getRelatorioAditivos(req: Request, res: Response, next: NextFunction) {
  try {
    const { ano } = lerFiltros(req.query);
    res.json(await montarRelatorioAditivos(ano));
  } catch (err) { next(err); }
}

// GET /api/audit/aditivos/export?ano=2026&status=pendente&responsavel=Fulana&busca=bld
export async function exportRelatorioAditivos(req: Request, res: Response, next: NextFunction) {
  try {
    const f   = lerFiltros(req.query);
    const rel = await montarRelatorioAditivos(f.ano);
    const empresas = filtrarEmpresas(rel.empresas, {
      status:      f.status,
      responsavel: f.responsavel || undefined,
      busca:       f.busca || undefined,
      soAlerta:    f.alerta === '1',
    });
    const buffer   = gerarXlsxAditivos(rel, empresas);
    const fileName = `auditoria_aditivos_${f.ano}.xlsx`;

    res.set({
      'Content-Type':        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Content-Length':      String(buffer.length),
    });
    res.send(buffer);
  } catch (err) { next(err); }
}
