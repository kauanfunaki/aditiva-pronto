import { describe, expect, it } from 'vitest';
import { camposAlterados, camposDoEnvio, inativaNoAcessorias } from './acessoriasService';
import { honorarioDaFicha, type FichaAcessorias } from './acessoriasClient';
import { chaveDoArquivo, mesmaVersao, selecionarPendentes, type ArquivoDoInventario } from './auditTextosService';

const FICHA: FichaAcessorias = {
  ID: '12', Identificador: '12.345.678/0001-90', Razao: 'EMPRESA X LTDA', Fantasia: 'X', Status: 'Ativa',
  Honorario: '600.00', DtLastDH: '2026-10-01 10:00:00',
  ContatosNaEmpresa: [{ Nome: 'A', 'E-mail': 'a@x.com' }, { Nome: 'B', 'E-mail': 'b@x.com' }],
};

describe('camposAlterados', () => {
  it('honorário e data de alteração não contam', () => {
    expect(camposAlterados(FICHA, { ...FICHA, Honorario: '1412.00', DtLastDH: '2026-10-02 11:00:00' })).toEqual([]);
  });

  it('acusa campo apagado ou trocado', () => {
    expect(camposAlterados(FICHA, { ...FICHA, Fantasia: '' })).toEqual(['Fantasia']);
    expect(camposAlterados(FICHA, { ...FICHA, ContatosNaEmpresa: [] })).toEqual(['ContatosNaEmpresa']);
  });

  it('ordem diferente na lista de contatos não é mudança', () => {
    const invertido = { ...FICHA, ContatosNaEmpresa: [...(FICHA.ContatosNaEmpresa as unknown[])].reverse() };
    expect(camposAlterados(FICHA, invertido)).toEqual([]);
  });

  it('ficha sumida depois do envio é alerta', () => {
    expect(camposAlterados(FICHA, null)).toHaveLength(1);
  });
});

describe('camposDoEnvio', () => {
  it('manda o identificador como está, o honorário no formato da API e repete razão e fantasia', () => {
    expect(camposDoEnvio(FICHA, 1199.14)).toEqual({
      cnpj: '12.345.678/0001-90', honorario: '1199.14', nome: 'EMPRESA X LTDA', fantasia: 'X',
    });
  });

  it('não manda fantasia vazia', () => {
    expect(camposDoEnvio({ ...FICHA, Fantasia: '' }, 10)).not.toHaveProperty('fantasia');
  });
});

describe('ficha do Acessórias', () => {
  it('inativa e honorário', () => {
    expect(inativaNoAcessorias(FICHA)).toBe(false);
    expect(inativaNoAcessorias({ ...FICHA, Status: 'Inativa' })).toBe(true);
    expect(honorarioDaFicha(FICHA)).toBe(600);
    expect(honorarioDaFicha({ ...FICHA, Honorario: '' })).toBeNull();
    expect(honorarioDaFicha(null)).toBeNull();
  });
});

describe('textos pendentes', () => {
  const arq = (nome: string, tamanho = 10, mod = '2026-01-01T00:00:00Z'): ArquivoDoInventario => ({
    chave: chaveDoArquivo('PASTA', `CONTRATO/${nome}`), nomePasta: 'PASTA', caminhoRelativo: `CONTRATO/${nome}`,
    nome, modificadoEm: new Date(mod), tamanho,
  });

  it('chave estável e diferente por caminho', () => {
    expect(chaveDoArquivo('A', 'b/c.pdf')).toMatch(/^[0-9a-f]{64}$/);
    expect(chaveDoArquivo('A', 'b/c.pdf')).toBe(chaveDoArquivo('A', 'b/c.pdf'));
    expect(chaveDoArquivo('A', 'b/c.pdf')).not.toBe(chaveDoArquivo('A b', 'c.pdf'));
  });

  it('pendente = sem leitura ou arquivo mudou; contrato e honorário primeiro', () => {
    const lido = arq('Termo Aditivo.pdf');
    const mudou = arq('outro.pdf', 20);
    const novo = arq('Contrato.pdf');
    const indice = new Map([
      [lido.chave, { modificado_em: new Date('2026-01-01T00:00:00Z'), tamanho: 10 }],
      [mudou.chave, { modificado_em: new Date('2026-01-01T00:00:00Z'), tamanho: 10 }],
    ]);
    expect(selecionarPendentes([lido, mudou, novo], indice).map((a) => a.nome)).toEqual(['Contrato.pdf', 'outro.pdf']);
  });

  it('mesmaVersao tolera os milissegundos que o DATETIME do banco perde', () => {
    const a = arq('x.pdf', 10, '2026-01-01T00:00:00.400Z');
    expect(mesmaVersao(a, { modificado_em: new Date('2026-01-01T00:00:00Z'), tamanho: 10 })).toBe(true);
    expect(mesmaVersao(a, { modificado_em: new Date('2026-01-01T00:00:02Z'), tamanho: 10 })).toBe(false);
  });
});
