import { describe, expect, it } from 'vitest';
import {
  compararComAcessorias, escolherHonorario, formatoAcessorias, minutaPeloNome, situacaoDoHonorario,
  type DocumentoDaEmpresa,
} from './honorariosRegras';

function doc(p: Partial<DocumentoDaEmpresa>): DocumentoDaEmpresa {
  return {
    nomePasta: 'EMPRESA', caminhoRelativo: `CONTRATO/${p.nome ?? 'doc.pdf'}`, nome: 'doc.pdf',
    modificadoEm: new Date('2026-01-01T12:00:00Z'), estado: 'ok', tipo: 'contrato', data: '2024-01-10',
    assinatura: 'digital', minuta: false, valor: null, adicional: null, forma: null, condicional: false, trecho: null,
    ...p,
  };
}

const contrato2022 = doc({ nome: 'contrato.pdf', data: '2022-03-01', valor: 600, forma: 'valor_mensal' });
const aditivoHon2025 = doc({ nome: 'aditivo honorario.pdf', tipo: 'aditivo', data: '2025-05-22', valor: 1621, forma: 'novo_valor' });
const aditivoAnual2026 = doc({ nome: 'Termo Aditivo.pdf', tipo: 'aditivo', data: '2026-05-11' });

describe('escolherHonorario', () => {
  it('vale o documento mais recente com valor (aditivo de honorário vence contrato antigo)', () => {
    const r = escolherHonorario([contrato2022, aditivoHon2025, aditivoAnual2026]);
    expect(r.documento?.valor).toBe(1621);
    expect(r.alertas).toEqual([]);
  });

  it('o aditivo anual sem valor (responsável técnico) não atrapalha nem gera alerta', () => {
    expect(escolherHonorario([contrato2022, aditivoAnual2026])).toMatchObject({ documento: { valor: 600 }, alertas: [] });
  });

  it('sem nenhum valor: nada escolhido', () => {
    expect(escolherHonorario([aditivoAnual2026]).documento).toBeNull();
  });

  it('acordo comercial e menção só entram se não houver contrato/aditivo com valor', () => {
    const acordo = doc({ nome: 'ACORDO SKAY.pdf', tipo: 'outro', data: '2026-01-01', valor: 900, forma: 'mencao' });
    expect(escolherHonorario([contrato2022, acordo]).documento?.valor).toBe(600);
    const so = escolherHonorario([acordo]);
    expect(so.documento?.valor).toBe(900);
    expect(so.alertas).toEqual(expect.arrayContaining(['acordo_comercial', 'mencao']));
  });

  it('minuta só vale se for a única com valor, e com alerta', () => {
    const minuta = doc({ nome: 'MINUTA contrato.docx', data: '2026-02-01', valor: 999, forma: 'valor_mensal', minuta: true });
    expect(escolherHonorario([contrato2022, minuta]).documento?.valor).toBe(600);
    expect(escolherHonorario([minuta]).alertas).toContain('minuta');
  });

  it('alertas: sem assinatura, condicional, sem data', () => {
    const r = escolherHonorario([doc({ valor: 500, forma: 'valor_mensal', assinatura: 'nao_se_aplica', condicional: true, data: null })]);
    expect(r.alertas).toEqual(expect.arrayContaining(['sem_assinatura', 'valor_condicional', 'sem_data']));
  });

  it('mesma data com valores diferentes pede conferência', () => {
    const a = doc({ nome: 'a.pdf', tipo: 'aditivo', data: '2026-04-09', valor: 1199.14, forma: 'novo_valor' });
    const b = doc({ nome: 'b.pdf', tipo: 'aditivo', data: '2026-04-09', valor: 257.81, forma: 'novo_valor' });
    expect(escolherHonorario([a, b]).alertas).toContain('valores_diferentes');
    // PDF e DOCX do mesmo documento, mesmo valor: sem alerta.
    const c = doc({ nome: 'a.docx', tipo: 'aditivo', data: '2026-04-09', valor: 1199.14, forma: 'novo_valor', assinatura: 'nao_se_aplica' });
    expect(escolherHonorario([a, c]).alertas).not.toContain('valores_diferentes');
  });

  it('contrato mais novo sem valor (ex.: digitalizado) pede conferência', () => {
    const scan = doc({ nome: 'CONTRATO assinado.pdf', estado: 'sem_texto', data: null, modificadoEm: new Date('2025-08-01T00:00:00Z') });
    expect(escolherHonorario([contrato2022, scan]).alertas).toContain('documento_mais_novo_sem_valor');
  });

  it('desempate na mesma data: aditivo antes de contrato, assinado antes de não assinado', () => {
    const cont = doc({ nome: 'c.pdf', data: '2025-01-01', valor: 100, forma: 'valor_mensal' });
    const adit = doc({ nome: 'a.pdf', tipo: 'aditivo', data: '2025-01-01', valor: 100, forma: 'novo_valor' });
    expect(escolherHonorario([cont, adit]).documento?.nome).toBe('a.pdf');
  });
});

describe('situacaoDoHonorario', () => {
  const sit = (docs: DocumentoDaEmpresa[], manual = false) => situacaoDoHonorario(docs, escolherHonorario(docs), manual).situacao;

  it('cada situação', () => {
    expect(sit([contrato2022])).toBe('LIDO');
    expect(sit([doc({ valor: 1, forma: 'valor_mensal', minuta: true })])).toBe('CONFERIR');
    // Sem assinatura e sem data são só avisos: o valor continua valendo.
    expect(sit([doc({ valor: 1, forma: 'valor_mensal', assinatura: 'nenhuma', data: null })])).toBe('LIDO');
    expect(sit([doc({ estado: 'pendente' })])).toBe('AGUARDANDO_LEITURA');
    expect(sit([doc({ estado: 'sem_texto' }), aditivoAnual2026])).toBe('DIGITALIZADO');
    expect(sit([doc({ estado: 'imagem', nome: 'contrato.jpg' })])).toBe('DIGITALIZADO');
    expect(sit([aditivoAnual2026])).toBe('SEM_VALOR');
    expect(sit([])).toBe('SEM_DOCUMENTO');
    expect(sit([], true)).toBe('MANUAL');
  });

  it('valor lido com documento ainda pendente vira CONFERIR (leitura incompleta)', () => {
    const r = situacaoDoHonorario([contrato2022, doc({ estado: 'pendente' })], escolherHonorario([contrato2022]), false);
    expect(r).toEqual({ situacao: 'CONFERIR', alertas: ['leitura_incompleta'] });
  });
});

describe('Acessórias', () => {
  it('compararComAcessorias', () => {
    expect(compararComAcessorias(600, { honorario: 600 }, false)).toBe('NAO_CONFERIDO');
    expect(compararComAcessorias(600, null, true)).toBe('NAO_ENCONTRADA');
    expect(compararComAcessorias(null, { honorario: 600 }, true)).toBe('SEM_VALOR_NO_APP');
    expect(compararComAcessorias(600, { honorario: 600.001 }, true)).toBe('IGUAL');
    expect(compararComAcessorias(600, { honorario: 0 }, true)).toBe('DIFERENTE');
    expect(compararComAcessorias(600, { honorario: null }, true)).toBe('DIFERENTE');
  });

  it('formatoAcessorias: milhar sem separador, decimal com ponto', () => {
    expect(formatoAcessorias(1412)).toBe('1412.00');
    expect(formatoAcessorias(1199.14)).toBe('1199.14');
    expect(() => formatoAcessorias(-1)).toThrow();
    expect(() => formatoAcessorias(Number.NaN)).toThrow();
  });

  it('minutaPeloNome', () => {
    expect(minutaPeloNome('MINUTA - Contrato.docx')).toBe(true);
    expect(minutaPeloNome('Contrato assinado.pdf')).toBe(false);
  });
});
