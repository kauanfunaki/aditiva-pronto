import { describe, expect, it } from 'vitest';
import { loteSchema, marcaSemPastaSchema, MAX_ARQUIVOS_POR_LOTE, vincularPastaSchema } from './auditPayload';

const arquivo = (n = 1) => ({
  caminhoRelativo: `CONTRATO DE PRESTAÇÃO DE SERVIÇOS/ALLMETAL - Termo Aditivo ${n}.PDF`,
  nome:            `ALLMETAL - Termo Aditivo ${n}.PDF`,
  ext:             '.PDF',
  tamanho:         184320,
  modificadoEm:    '2026-03-24T10:56:43-03:00',
  pdf:             { assinado: true, marca: 'icp' as const },
});

const loteValido = () => ({
  totalPastas: 513,
  pastas: [
    {
      nomePasta:         'ALLMETAL LTDA',
      subpastasContrato: ['CONTRATO DE PRESTAÇÃO DE SERVIÇOS'],
      erro:              null,
      arquivos:          [arquivo()],
    },
    { nomePasta: 'SCANNER', subpastasContrato: [], arquivos: [] },
  ],
});

describe('loteSchema', () => {
  it('aceita o exemplo da seção 8.3 do plano', () => {
    const r = loteSchema.safeParse(loteValido());
    expect(r.success).toBe(true);
  });

  it('põe a extensão em minúsculas', () => {
    const r = loteSchema.parse(loteValido());
    expect(r.pastas[0].arquivos[0].ext).toBe('.pdf');
  });

  it('aceita arquivo que não é PDF (sem o campo pdf)', () => {
    const lote = loteValido();
    const { pdf: _pdf, ...docx } = { ...arquivo(), nome: 'x.docx', ext: '.docx' };
    lote.pastas[0].arquivos = [docx as never];
    expect(loteSchema.safeParse(lote).success).toBe(true);
  });

  it('exige data com fuso', () => {
    const lote = loteValido();
    lote.pastas[0].arquivos[0].modificadoEm = '24/03/2025 10:56:43';
    expect(loteSchema.safeParse(lote).success).toBe(false);
  });

  it('recusa lote vazio', () => {
    expect(loteSchema.safeParse({ pastas: [] }).success).toBe(false);
  });

  it('recusa a mesma pasta duas vezes no lote', () => {
    const lote = loteValido();
    lote.pastas[1].nomePasta = 'ALLMETAL LTDA';
    const r = loteSchema.safeParse(lote);
    expect(r.success).toBe(false);
  });

  it('recusa lote acima do limite de arquivos', () => {
    const lote = loteValido();
    const muitos = Array.from({ length: MAX_ARQUIVOS_POR_LOTE + 1 }, (_, i) => arquivo(i));
    lote.pastas[0].arquivos = muitos.slice(0, MAX_ARQUIVOS_POR_LOTE);
    lote.pastas[1].arquivos = muitos.slice(MAX_ARQUIVOS_POR_LOTE);
    const r = loteSchema.safeParse(lote);
    expect(r.success).toBe(false);
  });
});

describe('vincularPastaSchema', () => {
  it('exige empresa (uuid) para vincular', () => {
    expect(vincularPastaSchema.safeParse({ acao: 'vincular', nomePasta: 'X' }).success).toBe(false);
    expect(vincularPastaSchema.safeParse({ acao: 'vincular', nomePasta: 'X', companyId: '1' }).success).toBe(false);
    expect(vincularPastaSchema.safeParse({
      acao: 'vincular', nomePasta: 'X', companyId: '0b6e2f7a-1c2d-4e5f-8a9b-0c1d2e3f4a5b',
    }).success).toBe(true);
  });

  it('ignorar e desfazer só precisam do nome da pasta', () => {
    expect(vincularPastaSchema.safeParse({ acao: 'ignorar', nomePasta: 'SCANNER' }).success).toBe(true);
    expect(vincularPastaSchema.safeParse({ acao: 'desfazer', nomePasta: 'SCANNER' }).success).toBe(true);
    expect(vincularPastaSchema.safeParse({ acao: 'apagar', nomePasta: 'SCANNER' }).success).toBe(false);
  });
});

describe('marcaSemPastaSchema', () => {
  const id = '0b6e2f7a-1c2d-4e5f-8a9b-0c1d2e3f4a5b';

  it('marcar aceita motivo opcional e troca vazio por null', () => {
    expect(marcaSemPastaSchema.parse({ acao: 'marcar', companyId: id })).toMatchObject({ motivo: null });
    expect(marcaSemPastaSchema.parse({ acao: 'marcar', companyId: id, motivo: '   ' })).toMatchObject({ motivo: null });
    expect(marcaSemPastaSchema.parse({ acao: 'marcar', companyId: id, motivo: ' MEI, sem contrato ' }))
      .toMatchObject({ motivo: 'MEI, sem contrato' });
  });

  it('recusa empresa sem uuid, motivo longo e ação desconhecida', () => {
    expect(marcaSemPastaSchema.safeParse({ acao: 'marcar', companyId: '1' }).success).toBe(false);
    expect(marcaSemPastaSchema.safeParse({ acao: 'marcar', companyId: id, motivo: 'x'.repeat(301) }).success).toBe(false);
    expect(marcaSemPastaSchema.safeParse({ acao: 'apagar', companyId: id }).success).toBe(false);
    expect(marcaSemPastaSchema.safeParse({ acao: 'desmarcar', companyId: id }).success).toBe(true);
  });
});
