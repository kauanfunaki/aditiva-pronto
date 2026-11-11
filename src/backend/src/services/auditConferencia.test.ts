import { describe, expect, it } from 'vitest';
import {
  anoDaConferencia, colunasConferenciaXlsx, conferenciaSchema, ehPendente, resolvidaManualmente,
} from './auditConferencia';

const id = '3f1c2b4a-1111-4222-8333-944455556666';
const conf = (situacao: 'pendente' | 'resolvido') =>
  ({ situacao, comentario: null, atualizadoPor: 'Societário', atualizadoEm: new Date('2026-11-14T13:00:00Z') });

describe('conferenciaSchema', () => {
  it('aditivo exige o ano', () => {
    expect(conferenciaSchema.safeParse({ companyId: id, modulo: 'aditivos', situacao: 'resolvido' }).success).toBe(false);
    expect(conferenciaSchema.safeParse({ companyId: id, modulo: 'aditivos', ano: 2026, situacao: 'resolvido' }).success).toBe(true);
  });

  it('contrato não precisa de ano', () => {
    expect(conferenciaSchema.safeParse({ companyId: id, modulo: 'contratos', situacao: 'pendente' }).success).toBe(true);
  });

  it('comentário em branco vira null e quebra de linha do Windows é normalizada', () => {
    const r1 = conferenciaSchema.parse({ companyId: id, modulo: 'contratos', situacao: 'pendente', comentario: '   ' });
    expect(r1.comentario).toBeNull();
    const r2 = conferenciaSchema.parse({ companyId: id, modulo: 'contratos', situacao: 'pendente', comentario: ' a\r\nb ' });
    expect(r2.comentario).toBe('a\nb');
  });

  it('recusa situação desconhecida, id inválido e comentário longo demais', () => {
    expect(conferenciaSchema.safeParse({ companyId: id, modulo: 'contratos', situacao: 'feito' }).success).toBe(false);
    expect(conferenciaSchema.safeParse({ companyId: 'x', modulo: 'contratos', situacao: 'pendente' }).success).toBe(false);
    expect(conferenciaSchema.safeParse({ companyId: id, modulo: 'contratos', situacao: 'pendente', comentario: 'a'.repeat(2001) }).success).toBe(false);
  });
});

describe('regras de pendência', () => {
  it('pendente = fora do dia, sem distrato e não resolvida', () => {
    expect(ehPendente({ emDia: false, status: 'SEM_ADITIVO', conferencia: null })).toBe(true);
    expect(ehPendente({ emDia: false, status: 'SEM_ADITIVO', conferencia: conf('pendente') })).toBe(true);
    expect(ehPendente({ emDia: false, status: 'SEM_ADITIVO', conferencia: conf('resolvido') })).toBe(false);
    expect(ehPendente({ emDia: false, status: 'DISTRATO', conferencia: null })).toBe(false);
    expect(ehPendente({ emDia: true, status: 'ASSINADO_DIGITAL', conferencia: null })).toBe(false);
  });

  it('resolvida manualmente só conta quem sairia das pendentes', () => {
    expect(resolvidaManualmente({ emDia: false, status: 'SEM_ADITIVO', conferencia: conf('resolvido') })).toBe(true);
    expect(resolvidaManualmente({ emDia: true, status: 'ASSINADO_DIGITAL', conferencia: conf('resolvido') })).toBe(false);
  });

  it('contrato fica sempre no ano 0', () => {
    expect(anoDaConferencia('contratos', 2026)).toBe(0);
    expect(anoDaConferencia('aditivos', 2026)).toBe(2026);
  });

  it('colunas do XLSX', () => {
    expect(colunasConferenciaXlsx(null)).toEqual(['Pendente', '', '']);
    expect(colunasConferenciaXlsx({ ...conf('resolvido'), comentario: 'ok' }))
      .toEqual(['Resolvido', 'ok', 'Societário em 14/11/2026, 10:00']);
  });
});
