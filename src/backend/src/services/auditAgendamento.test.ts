import { describe, expect, it } from 'vitest';
import { deveCriarJobAgendado, horarioDeHoje } from './auditAgendamento';

// São Paulo é UTC-3 (sem horário de verão desde 2019): 06:00 local = 09:00Z.
const utc = (iso: string) => new Date(iso);

describe('horarioDeHoje', () => {
  it('converte o horário local de São Paulo para UTC', () => {
    expect(horarioDeHoje(utc('2026-10-01T15:00:00Z'), '06:00').toISOString())
      .toBe('2026-10-01T09:00:00.000Z');
  });

  it('usa o "hoje" de São Paulo, não o do UTC', () => {
    // 02:30Z do dia 2 ainda é 23:30 do dia 1 em São Paulo.
    expect(horarioDeHoje(utc('2026-10-02T02:30:00Z'), '06:00').toISOString())
      .toBe('2026-10-01T09:00:00.000Z');
  });

  it('recusa horário mal formado', () => {
    expect(() => horarioDeHoje(utc('2026-10-01T15:00:00Z'), '6h')).toThrow(/inválido/);
    expect(() => horarioDeHoje(utc('2026-10-01T15:00:00Z'), '24:00')).toThrow(/inválido/);
  });
});

describe('deveCriarJobAgendado', () => {
  it('não cria antes do horário', () => {
    expect(deveCriarJobAgendado(utc('2026-10-01T08:59:00Z'), '06:00', null)).toBe(false);
  });

  it('cria depois do horário quando nunca houve job', () => {
    expect(deveCriarJobAgendado(utc('2026-10-01T09:00:00Z'), '06:00', null)).toBe(true);
  });

  it('cria quando o último job foi pedido antes do horário de hoje', () => {
    expect(deveCriarJobAgendado(utc('2026-10-01T12:00:00Z'), '06:00', utc('2026-09-30T20:00:00Z'))).toBe(true);
    expect(deveCriarJobAgendado(utc('2026-10-01T12:00:00Z'), '06:00', utc('2026-10-01T08:59:00Z'))).toBe(true);
  });

  it('não cria se já houve job (de qualquer origem) depois do horário de hoje', () => {
    expect(deveCriarJobAgendado(utc('2026-10-01T12:00:00Z'), '06:00', utc('2026-10-01T09:00:00Z'))).toBe(false);
    expect(deveCriarJobAgendado(utc('2026-10-01T12:00:00Z'), '06:00', utc('2026-10-01T11:30:00Z'))).toBe(false);
  });

  it('não cria nada sem horário configurado', () => {
    expect(deveCriarJobAgendado(utc('2026-10-01T12:00:00Z'), null, null)).toBe(false);
  });
});
