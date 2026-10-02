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

  it('decisão do Societário: nome assinado conta como assinado, com motivo próprio', () => {
    expect(calcularStatusContrato([pasta(arq('ASSINADO - CONTRATO DE SERVIÇOS.pdf'))]))
      .toMatchObject({ status: 'ASSINADO', motivo: 'CONTRATO_ASSINADO_PELO_NOME', emDia: true });
  });

  it('assinatura digital deixa em dia', () => {
    expect(calcularStatusContrato([pasta(arq('CONTRATO DE SERVIÇOS.pdf', { pdfAssinado: true }))]))
      .toMatchObject({ status: 'ASSINADO', motivo: 'CONTRATO_DIGITAL_ASSINADO', emDia: true });
  });

  it('assinatura digital prevalece sobre nome contraditório e mantém aviso', () => {
    expect(calcularStatusContrato([pasta(arq('CONTRATO - Sem assinatura.pdf', { pdfAssinado: true }))]))
      .toMatchObject({ status: 'ASSINADO', motivo: 'CONTRATO_DIGITAL_ASSINADO', warnings: { length: 1 } });
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
      arq('CONTRATO DE SERVIÇOS 2025.pdf', { modificadoEm: new Date('2026-09-01T10:00:00Z') }),
      arq('CONTRATO DE SERVIÇOS 2026.pdf', { modificadoEm: new Date('2026-10-01T10:00:00Z') }),
    )]);
    expect(r).toMatchObject({ status: 'REVISAR', motivo: 'MULTIPLOS_CONTRATOS_ATUAIS', contratoPrincipal: null });
  });

  it('múltiplos grupos ficam assinados quando um contrato atual está assinado', () => {
    const r = calcularStatusContrato([pasta(
      arq('Contrato de Prestação de Serviços.docx'),
      arq('EMPRESA - Contrato de Serviços - Assinado.pdf'),
    )]);
    expect(r).toMatchObject({
      status: 'ASSINADO',
      motivo: 'CONTRATO_ASSINADO_PELO_NOME',
      emDia: true,
      contratoPrincipal: { nome: 'EMPRESA - Contrato de Serviços - Assinado.pdf' },
    });
    expect(r.warnings[0]).toContain('identidades diferentes');
  });

  it('múltiplos grupos priorizam a evidência digital e mantêm os demais como aviso', () => {
    const r = calcularStatusContrato([pasta(
      arq('CONTRATO DE PRESTAÇÃO DE SERVIÇOS.docx'),
      arq('EMPRESA - Contrato de Serviços.pdf', { pdfAssinado: true, pdfMarca: 'icp' }),
      arq('CONTRATO DE SERVIÇOS 2025.pdf'),
    )]);
    expect(r).toMatchObject({
      status: 'ASSINADO',
      motivo: 'CONTRATO_DIGITAL_ASSINADO',
      emDia: true,
    });
    expect(r.warnings[0]).toContain('identidades diferentes');
  });

  it('PDF ou imagem sem nome reconhecível na subpasta exige revisão', () => {
    expect(calcularStatusContrato([pasta(arq('BLD - FILIAL 012.pdf'))]))
      .toMatchObject({ status: 'REVISAR', motivo: 'ARQUIVO_NAO_IDENTIFICADO' });
    expect(calcularStatusContrato([pasta(arq('Pagina 1 c.jpg'))]))
      .toMatchObject({ status: 'REVISAR', motivo: 'ARQUIVO_NAO_IDENTIFICADO' });
  });

  it('PDF grande ou não lido exige revisão em vez de parecer sem assinatura', () => {
    expect(calcularStatusContrato([pasta(arq('CONTRATO DE SERVIÇOS.pdf', { pdfAssinado: null }))]))
      .toMatchObject({ status: 'REVISAR', motivo: 'PDF_NAO_ANALISADO' });
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
