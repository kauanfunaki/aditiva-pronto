import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { resumirErroZod } from '../services/auditPayload';
import { STATUS_CONTRATO } from '../services/auditContratosStatus';
import {
  filtrarEmpresasContratos, gerarXlsxContratos, montarRelatorioContratos,
} from '../services/auditContratosService';

const filtrosSchema = z.object({
  status:      z.enum([...STATUS_CONTRATO, 'em_dia', 'pendente']).optional(),
  responsavel: z.string().trim().max(100).optional(),
  busca:       z.string().trim().max(200).optional(),
});

function lerFiltros(query: unknown) {
  const resultado = filtrosSchema.safeParse(query);
  if (!resultado.success) throw new AppError(400, `Parâmetros inválidos — ${resumirErroZod(resultado.error)}`);
  return resultado.data;
}

// GET /api/audit/contratos
export async function getRelatorioContratos(_req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await montarRelatorioContratos());
  } catch (err) { next(err); }
}

// GET /api/audit/contratos/export?status=pendente&responsavel=Fulana&busca=empresa
export async function exportRelatorioContratos(req: Request, res: Response, next: NextFunction) {
  try {
    const filtros = lerFiltros(req.query);
    const relatorio = await montarRelatorioContratos();
    const empresas = filtrarEmpresasContratos(relatorio.empresas, {
      status: filtros.status,
      responsavel: filtros.responsavel || undefined,
      busca: filtros.busca || undefined,
    });
    const buffer = gerarXlsxContratos(relatorio, empresas);
    const fileName = 'auditoria_contratos.xlsx';
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Content-Length': String(buffer.length),
    });
    res.send(buffer);
  } catch (err) { next(err); }
}
