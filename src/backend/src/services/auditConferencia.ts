// Conferência manual da auditoria: a equipe marca a empresa como Resolvido/Pendente e
// deixa um comentário, em Contratos e em Aditivos. "Resolvido" tira a empresa da lista
// de pendentes; a classificação automática do robô continua aparecendo ao lado.

import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import * as repo from '../repositories/auditConferenciaRepository';
import type { ModuloConferencia, SituacaoConferencia } from '../repositories/auditConferenciaRepository';
import { empresaExiste } from '../repositories/auditRepository';

export const MAX_COMENTARIO = 2000;

export interface ConferenciaDTO {
  situacao:      SituacaoConferencia;
  comentario:    string | null;
  atualizadoPor: string;
  atualizadoEm:  Date;
}

export const conferenciaSchema = z.object({
  companyId:  z.string().uuid(),
  modulo:     z.enum(['contratos', 'aditivos']),
  /** Obrigatório em aditivos (ano de referência da tela); ignorado em contratos. */
  ano:        z.number().int().min(2015).max(2100).optional(),
  situacao:   z.enum(['pendente', 'resolvido']),
  comentario: z.string().max(MAX_COMENTARIO).optional().nullable()
    .transform((c) => (c ?? '').replace(/\r\n/g, '\n').trim() || null),
}).refine((c) => c.modulo === 'contratos' || c.ano !== undefined, {
  message: 'Informe o ano de referência do aditivo.', path: ['ano'],
});

export type EntradaConferencia = z.infer<typeof conferenciaSchema>;

/** Contrato não é anual: a conferência dele fica sempre no ano 0. */
export const anoDaConferencia = (modulo: ModuloConferencia, ano?: number) =>
  modulo === 'contratos' ? 0 : ano!;

export async function carregarConferencias(
  modulo: ModuloConferencia,
  ano: number,
): Promise<Map<string, ConferenciaDTO>> {
  const rows = await repo.listarConferencias(modulo, anoDaConferencia(modulo, ano));
  return new Map(rows.map((r) => [r.company_id, {
    situacao:      r.situacao,
    comentario:    r.comentario,
    atualizadoPor: r.atualizado_por,
    atualizadoEm:  r.atualizado_em,
  }]));
}

export async function salvarConferencia(
  entrada: EntradaConferencia,
  por: string,
  agora = new Date(),
): Promise<ConferenciaDTO | null> {
  if (!(await empresaExiste(entrada.companyId))) throw new AppError(404, 'Empresa não encontrada.');
  const ano = anoDaConferencia(entrada.modulo, entrada.ano);

  if (entrada.situacao === 'pendente' && !entrada.comentario) {
    await repo.apagarConferencia(entrada.companyId, entrada.modulo, ano);
    return null;
  }
  await repo.salvarConferencia({
    companyId: entrada.companyId, modulo: entrada.modulo, ano,
    situacao: entrada.situacao, comentario: entrada.comentario, por, agora,
  });
  return { situacao: entrada.situacao, comentario: entrada.comentario, atualizadoPor: por, atualizadoEm: agora };
}

// ── Regras usadas pelos relatórios e pelos filtros ────────────────

interface LinhaComConferencia {
  emDia:        boolean;
  status:       string;
  conferencia:  ConferenciaDTO | null;
}

export const resolvida = (l: { conferencia: ConferenciaDTO | null }) =>
  l.conferencia?.situacao === 'resolvido';

/**
 * Pendente = não está em dia pela regra automática, não tem distrato e ninguém marcou
 * como resolvida na conferência manual.
 */
export const ehPendente = (l: LinhaComConferencia) =>
  !l.emDia && l.status !== 'DISTRATO' && !resolvida(l);

/** Resolvidas à mão que, sem isso, estariam nas pendentes (as que de fato saíram da lista). */
export const resolvidaManualmente = (l: LinhaComConferencia) =>
  !l.emDia && l.status !== 'DISTRATO' && resolvida(l);

export function colunasConferenciaXlsx(c: ConferenciaDTO | null): [string, string, string] {
  if (!c) return ['Pendente', '', ''];
  const em = c.atualizadoEm.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
  return [c.situacao === 'resolvido' ? 'Resolvido' : 'Pendente', c.comentario ?? '', `${c.atualizadoPor} em ${em}`];
}

export const CABECALHO_CONFERENCIA_XLSX = ['Conferência', 'Comentário', 'Conferido por'] as const;
