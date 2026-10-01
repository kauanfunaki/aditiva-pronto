import { describe, expect, it } from 'vitest';
import {
  classificarContrato,
  detectarAssinaturaContrato,
  identidadeDoContrato,
  type ArquivoParaClassificarContrato,
} from './auditContratosClassificador';

const SUB = 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS';

function arq(caminho: string, extra: Partial<ArquivoParaClassificarContrato> = {}): ArquivoParaClassificarContrato {
  const nome = caminho.split('/').pop()!;
  const ext = nome.includes('.') ? nome.slice(nome.lastIndexOf('.')).toLowerCase() : '';
  return {
    nome,
    caminhoRelativo: `${SUB}/${caminho}`,
    ext,
    modificadoEm: new Date('2026-03-24T13:56:43Z'),
    pdfAssinado: ext === '.pdf' ? false : null,
    pdfMarca: null,
    ...extra,
  };
}

const c = (nome: string, extra?: Partial<ArquivoParaClassificarContrato>) => classificarContrato(arq(nome, extra));

describe('classificarContrato', () => {
  it.each([
    'CONTRATO DE PRESTAÇÃO DE SERVIÇOS.pdf',
    'Contrato de Serviços Contábeis.docx',
    'CONTRATO PREST SERVIÇOS - EMPRESA.pdf',
    'Assinado - CONTRATO PRESTAÇÃO DE SERVIÇOS.pdf',
    'CONTRATO - EMPRESA CLIENTE.pdf',
  ])('aceita contrato de serviços: %s', (nome) => {
    expect(c(nome)).toMatchObject({ ehContratoServico: true, motivoExclusao: null });
  });

  it.each([
    ['EMPRESA - Termo Aditivo.pdf', 'aditivo'],
    ['Termo Aditivo 13º - EMPRESA.pdf', 'aditivo'],
    ['DISTRATO DO CONTRATO.pdf', 'distrato'],
    ['CONTRATO DE ABERTURA DE EMPRESA.pdf', 'abertura_empresa'],
    ['ALTERAÇÃO CONTRATUAL.pdf', 'alteracao_contratual'],
    ['CONTRATO DE ALUGUEL.pdf', 'aluguel_locacao_coworking'],
    ['CONTRATO DE LOCAÇÃO.pdf', 'aluguel_locacao_coworking'],
    ['CONTRATO COWORKING.pdf', 'aluguel_locacao_coworking'],
    ['CONTRATO SOCIAL.pdf', 'contrato_social'],
    ['CONTRATO DE HONORÁRIOS.pdf', 'honorarios'],
    ['MODELO CONTRATO SERVIÇOS.pdf', 'modelo'],
    ['BOLETO.pdf', 'nao_parece_contrato'],
  ] as const)('exclui %s como %s', (nome, motivo) => {
    expect(c(nome)).toMatchObject({ ehContratoServico: false, motivoExclusao: motivo });
  });

  it('detecta antigo e minuta sem descartar o contrato', () => {
    expect(c('CONTRATO PRESTAÇÃO DE SERVIÇOS (ANTIGO).pdf')).toMatchObject({
      ehContratoServico: true,
      antigo: true,
    });
    expect(c('MINUTA - CONTRATO DE SERVIÇOS.docx')).toMatchObject({
      ehContratoServico: true,
      minuta: true,
    });
  });
});

describe('assinatura', () => {
  it.each([
    'Assinado - CONTRATO PRESTAÇÃO DE SERVIÇOS.pdf',
    'novo Assinado - CONTRATO PRESTAÇÃO DE SERVIÇOS.pdf',
    'CONTRATO PRESTAÇÃO DE SERVIÇOS - Assinado.pdf',
    'CONTRATO PRESTAÇÃO DE SERVIÇOS (assinada).pdf',
  ])('detecta indicação positiva sem usar includes ingênuo: %s', (nome) => {
    expect(c(nome).assinatura).toMatchObject({ peloNome: true, explicitamenteAusente: false });
  });

  it('detecta SEM ASSINATURA antes do sinal positivo', () => {
    expect(c('CONTRATO PRESTAÇÃO DE SERVIÇOS - Sem assinatura.pdf').assinatura)
      .toMatchObject({ peloNome: false, explicitamenteAusente: true });
    expect(detectarAssinaturaContrato('NÃO ASSINADO - CONTRATO.pdf', 'pdf', false))
      .toMatchObject({ peloNome: false, explicitamenteAusente: true });
  });

  it('preserva contradição entre assinatura digital e nome', () => {
    expect(c('CONTRATO - Sem assinatura.pdf', { pdfAssinado: true, pdfMarca: 'icp' })).toMatchObject({
      icp: true,
      assinatura: { digital: true, peloNome: false, explicitamenteAusente: true, contraditoria: true },
    });
  });
});

describe('identidadeDoContrato', () => {
  it('agrupa DOCX, PDF e prefixo assinado do mesmo contrato', () => {
    const chaves = [
      arq('CONTRATO PRESTAÇÃO DE SERVIÇOS.docx'),
      arq('CONTRATO PRESTAÇÃO DE SERVIÇOS.pdf'),
      arq('ASSINADO - CONTRATO PRESTAÇÃO DE SERVIÇOS.pdf'),
    ].map(identidadeDoContrato);
    expect(new Set(chaves).size).toBe(1);
  });

  it('não junta contratos de anos ou subpastas diferentes', () => {
    expect(identidadeDoContrato(arq('CONTRATO SERVIÇOS 2025.pdf')))
      .not.toBe(identidadeDoContrato(arq('CONTRATO SERVIÇOS 2026.pdf')));
    expect(identidadeDoContrato(arq('EMPRESA NOVA/CONTRATO SERVIÇOS.pdf')))
      .not.toBe(identidadeDoContrato(arq('CONTRATO SERVIÇOS.pdf')));
  });
});
