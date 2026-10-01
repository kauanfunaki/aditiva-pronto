import { describe, expect, it } from 'vitest';
import { calcularStatusContrato, type PastaParaStatusContrato } from './auditContratosStatus';
import type { ArquivoParaClassificarContrato } from './auditContratosClassificador';

const SUB = 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS';

function arq(nome: string, extra: Partial<ArquivoParaClassificarContrato> = {}): ArquivoParaClassificarContrato {
  const ext = nome.slice(nome.lastIndexOf('.')).toLowerCase();
  return {
    nome,
    caminhoRelativo: `${SUB}/${nome}`,
    ext,
    modificadoEm: new Date('2026-03-24T13:00:00Z'),
    pdfAssinado: ext === '.pdf' ? false : null,
    pdfMarca: null,
    ...extra,
  };
}

const pasta = (...arquivos: ArquivoParaClassificarContrato[]): PastaParaStatusContrato => ({
  nomePasta: 'EMPRESA LTDA',
  subpastasContrato: [SUB],
  arquivos,
});

describe('calcularStatusContrato', () => {
  it('mantém motivos diferentes dentro do estado NÃO LOCALIZADO', () => {
    expect(calcularStatusContrato([])).toMatchObject({ status: 'NAO_LOCALIZADO', motivo: 'SEM_VINCULO' });
    expect(calcularStatusContrato([{ nomePasta: 'X', subpastasContrato: [], arquivos: [] }]))
      .toMatchObject({ status: 'NAO_LOCALIZADO', motivo: 'SEM_PASTA_CONTRATO' });
    expect(calcularStatusContrato([pasta(arq('TERMO ADITIVO.pdf'))]))
      .toMatchObject({ status: 'NAO_LOCALIZADO', motivo: 'SEM_CONTRATO_SERVICO' });
  });

  it('classifica Word como minuta', () => {
    expect(calcularStatusContrato([pasta(arq('CONTRATO DE SERVIÇOS.docx'))]))
      .toMatchObject({ status: 'MINUTA', motivo: 'APENAS_MINUTA', emDia: false });
  });

  it('classifica PDF sem assinatura como aguardando', () => {
    expect(calcularStatusContrato([pasta(arq('CONTRATO DE SERVIÇOS - Sem assinatura.pdf'))]))
      .toMatchObject({ status: 'AGUARDANDO_ASSINATURA', motivo: 'PDF_SEM_ASSINATURA' });
  });

  it('nome assinado sem assinatura digital exige revisão física manual', () => {
    expect(calcularStatusContrato([pasta(arq('ASSINADO - CONTRATO DE SERVIÇOS.pdf'))]))
      .toMatchObject({ status: 'REVISAR', motivo: 'POSSIVEL_ASSINATURA_FISICA', emDia: false });
  });

  it('assinatura digital deixa em dia', () => {
    expect(calcularStatusContrato([pasta(arq('CONTRATO DE SERVIÇOS.pdf', { pdfAssinado: true }))]))
      .toMatchObject({ status: 'ASSINADO', motivo: 'CONTRATO_DIGITAL_ASSINADO', emDia: true });
  });

  it('contradição é revisão, mesmo com assinatura digital', () => {
    expect(calcularStatusContrato([pasta(arq('CONTRATO - Sem assinatura.pdf', { pdfAssinado: true }))]))
      .toMatchObject({ status: 'REVISAR', motivo: 'EVIDENCIA_CONTRADITORIA' });
  });

  it('prioriza contrato atual sobre o marcado como antigo', () => {
    const r = calcularStatusContrato([pasta(
      arq('CONTRATO DE SERVIÇOS (ANTIGO).pdf', { caminhoRelativo: `${SUB}/ANTIGO/CONTRATO DE SERVIÇOS.pdf`, pdfAssinado: true }),
      arq('CONTRATO DE SERVIÇOS.pdf'),
    )]);
    expect(r).toMatchObject({ status: 'AGUARDANDO_ASSINATURA', gruposAtuais: { length: 1 }, gruposAntigos: { length: 1 } });
  });

  it('somente contrato antigo exige revisão', () => {
    expect(calcularStatusContrato([pasta(arq('CONTRATO DE SERVIÇOS (ANTIGO).pdf'))]))
      .toMatchObject({ status: 'REVISAR', motivo: 'SOMENTE_CONTRATO_ANTIGO' });
  });

  it('contratos logicamente distintos exigem revisão; data não escolhe entre eles', () => {
    const r = calcularStatusContrato([pasta(
      arq('CONTRATO DE SERVIÇOS 2025.pdf', { modificadoEm: new Date('2026-09-01T10:00:00Z'), pdfAssinado: true }),
      arq('CONTRATO DE SERVIÇOS 2026.pdf', { modificadoEm: new Date('2026-10-01T10:00:00Z') }),
    )]);
    expect(r).toMatchObject({ status: 'REVISAR', motivo: 'MULTIPLOS_CONTRATOS_ATUAIS', contratoPrincipal: null });
  });

  it('no mesmo contrato, assinatura vence formato e a data só desempata evidência equivalente', () => {
    const r = calcularStatusContrato([pasta(
      arq('CONTRATO DE SERVIÇOS.docx', { modificadoEm: new Date('2026-10-01T10:00:00Z') }),
      arq('CONTRATO DE SERVIÇOS.pdf', { modificadoEm: new Date('2026-09-01T10:00:00Z'), pdfAssinado: true }),
    )]);
    expect(r).toMatchObject({ status: 'ASSINADO', contratoPrincipal: { nome: 'CONTRATO DE SERVIÇOS.pdf' } });
  });

  it('imagem exige inspeção visual', () => {
    expect(calcularStatusContrato([pasta(arq('CONTRATO DE SERVIÇOS.jpg'))]))
      .toMatchObject({ status: 'REVISAR', motivo: 'FORMATO_EXIGE_REVISAO' });
  });
});
