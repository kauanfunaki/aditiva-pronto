import { describe, expect, it } from 'vitest';
import { planejarRenomeacaoContrato } from './auditContratosRenomeacao';
import type { ArquivoParaClassificarContrato } from './auditContratosClassificador';

const arquivo = (nome: string): ArquivoParaClassificarContrato => ({
  nome,
  caminhoRelativo: `CONTRATO DE SERVIÇOS/${nome}`,
  ext: '.pdf',
  modificadoEm: new Date('2026-10-01T10:00:00Z'),
  pdfAssinado: true,
  pdfMarca: 'icp',
});

describe('planejarRenomeacaoContrato', () => {
  it('recomenda prefixo, preserva extensão e nunca executa', () => {
    expect(planejarRenomeacaoContrato(arquivo('CONTRATO DE SERVIÇOS.pdf'), [])).toEqual({
      dryRun: true,
      executar: false,
      recomendado: true,
      caminhoOriginal: 'CONTRATO DE SERVIÇOS/CONTRATO DE SERVIÇOS.pdf',
      caminhoDestino: 'CONTRATO DE SERVIÇOS/ASSINADO - CONTRATO DE SERVIÇOS.pdf',
      resultado: 'recomendado',
    });
  });

  it.each(['ASSINADO - CONTRATO.pdf', 'Assinada CONTRATO.pdf', 'ASS - CONTRATO.pdf'])
    ('não duplica indicação existente: %s', (nome) => {
      expect(planejarRenomeacaoContrato(arquivo(nome), [])).toMatchObject({
        recomendado: false,
        resultado: 'ja_padronizado',
      });
    });

  it('detecta destino existente sem diferenciar caixa ou composição Unicode', () => {
    const plano = planejarRenomeacaoContrato(arquivo('Contrato de Serviços.pdf'), [
      'CONTRATO DE SERVIÇOS/assinado - contrato de serviços.pdf',
    ]);
    expect(plano).toMatchObject({ recomendado: false, resultado: 'destino_existente' });
  });
});
