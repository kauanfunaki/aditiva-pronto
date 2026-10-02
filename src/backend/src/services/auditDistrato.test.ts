import { describe, expect, it } from 'vitest';
import {
  analisarDistratos, arquivoEmDistrato, dataFimDoDistrato, ehDocumentoDeDistrato, ehSubpastaDistrato,
  montarDocumentoDistrato, textoDoDistrato, paraDistratoDTO, tipoDoDistrato, type DocumentoDistrato,
} from './auditDistrato';

// Trechos e nomes dos distratos reais da rede (levantamento de 02/10/2026).

describe('subpasta e tipo', () => {
  it.each([
    'DISTRATO DE PRESTAÇÃO DE SERVIÇOS', 'DISTRATO PRESTAÇÃO SERVIÇOS CONTABEIS', 'DISTRATO', 'distrato bpo',
  ])('"%s" é subpasta de distrato', (n) => expect(ehSubpastaDistrato(n)).toBe(true));

  it('contrato não é distrato', () => {
    expect(ehSubpastaDistrato('CONTRATO DE PRESTAÇÃO DE SERVIÇOS')).toBe(false);
    expect(arquivoEmDistrato('CONTRATO DE SERVIÇOS/x.pdf')).toBe(false);
    expect(arquivoEmDistrato('DISTRATO DE PRESTAÇÃO DE SERVIÇOS/x.pdf')).toBe(true);
    expect(arquivoEmDistrato('arquivo-na-raiz.pdf')).toBe(false);
  });

  it('tipo pela subpasta (e BPO também pelo nome do arquivo)', () => {
    expect(tipoDoDistrato('DISTRATO DE PRESTAÇÃO DE SERVIÇOS', 'x.pdf')).toBe('contabil');
    expect(tipoDoDistrato('DISTRATO BPO', 'x.pdf')).toBe('bpo');
    expect(tipoDoDistrato('DISTRATO', 'SAF 041 BPO.pdf')).toBe('bpo');
    expect(tipoDoDistrato('DISTRATO SOCIAL', 'x.pdf')).toBe('social');
  });

  it('boleto, comprovante e recibo não são o distrato', () => {
    expect(ehDocumentoDeDistrato('CARLA DA SILVA DIAS - Boleto Aviso Distrato P.S.pdf', '.pdf')).toBe(false);
    expect(ehDocumentoDeDistrato('Comprovante de pagamento.pdf', '.pdf')).toBe(false);
    expect(ehDocumentoDeDistrato('INOVALOG - Distrato de Prestação de Serviços Contábeis Assinado.pdf', '.pdf')).toBe(true);
    expect(ehDocumentoDeDistrato('anotacoes.txt', '.txt')).toBe(false);
  });
});

describe('dataFimDoDistrato', () => {
  it.each([
    ['em razão deste distrato, executará seus serviços até 31/07/2026, com o cumprimento do aviso prévio', '2026-07-31'],
    ['o contratado, em razão do contrato ora distratado, executou seus serviços até 30/04/2026. CLÁUSULA', '2026-04-30'],
    ['a quantia de R$ 379,50, a título de serviços prestados até 30/04/2026.', '2026-04-30'],
    ['executará seus\nserviços até 5/3/2026, sem o cumprimento', '2026-03-05'],
  ])('%s', (texto, data) => expect(dataFimDoDistrato(texto)).toBe(data));

  it('sem a frase ou com data impossível: null', () => {
    expect(dataFimDoDistrato('Curitiba, 30 de setembro de 2026.')).toBeNull();
    expect(dataFimDoDistrato('executará seus serviços até 31/02/2026')).toBeNull();
  });
});

function doc(p: Partial<DocumentoDistrato>): DocumentoDistrato {
  return {
    nomePasta: 'X', caminhoRelativo: 'DISTRATO/x.pdf', nome: 'x.pdf', tipo: 'contabil', assinatura: 'nenhuma',
    dataFim: null, dataDocumento: null, modificadoEm: new Date('2026-09-29T12:00:00Z'), ...p,
  };
}

describe('analisarDistratos', () => {
  it('sem documento: null', () => {
    expect(analisarDistratos([], null)).toBeNull();
  });

  it('INOVALOG: Word, PDF e PDF assinado → vale o assinado', () => {
    const r = analisarDistratos([
      doc({ nome: 'DISTRATO - Sem cumprimento do aviso.docx', assinatura: 'nao_se_aplica' }),
      doc({ nome: 'INOVALOG - Distrato.pdf', dataFim: '2026-09-30' }),
      doc({ nome: 'INOVALOG - Distrato Assinado.pdf', assinatura: 'pelo_nome', dataFim: '2026-09-30', modificadoEm: new Date('2026-09-30T16:42:00Z') }),
    ], '2023-05-01')!;
    expect(r.efetivo?.nome).toBe('INOVALOG - Distrato Assinado.pdf');
    expect(r.desconsiderado).toBeNull();
  });

  it('só minuta sem assinatura ainda conta (decisão: sai das pendências), com a assinatura visível', () => {
    const r = analisarDistratos([doc({ assinatura: 'nao_se_aplica' })], null)!;
    expect(r.efetivo?.assinatura).toBe('nao_se_aplica');
    expect(paraDistratoDTO(r)?.efetivo?.assinado).toBe(false);
  });

  it('contrato mais novo que o distrato: o cliente voltou, distrato desconsiderado', () => {
    const r = analisarDistratos([doc({ dataDocumento: '2024-04-30', assinatura: 'digital' })], '2025-02-01')!;
    expect(r.efetivo).toBeNull();
    expect(r.desconsiderado?.contratoMaisNovoEm).toBe('2025-02-01');
  });

  it('BPO e social são só aviso', () => {
    const r = analisarDistratos([doc({ tipo: 'bpo' }), doc({ tipo: 'social' })], null)!;
    expect(r.efetivo).toBeNull();
    expect(r.avisos.map((a) => a.tipo)).toEqual(['bpo', 'social']);
  });
});

describe('montarDocumentoDistrato e texto para planilha', () => {
  it('lê assinatura pelo PDF e pelo nome', () => {
    const base = {
      nomePasta: 'INOVALOG TRANSPORTES LTDA', caminhoRelativo: 'DISTRATO DE PRESTAÇÃO DE SERVIÇOS/a.pdf',
      ext: '.pdf', modificadoEm: new Date('2026-09-30T00:00:00Z'), pdfMarca: null,
    };
    expect(montarDocumentoDistrato({ ...base, nome: 'a.pdf', pdfAssinado: true }, null).assinatura).toBe('digital');
    expect(montarDocumentoDistrato({ ...base, nome: 'a Assinado.pdf', pdfAssinado: false }, null).assinatura).toBe('pelo_nome');
    expect(montarDocumentoDistrato({ ...base, nome: 'a.pdf', pdfAssinado: false }, { dataFim: '2026-09-30', dataDocumento: null }).dataFim).toBe('2026-09-30');
  });

  it('textoDoDistrato', () => {
    const r = analisarDistratos([doc({ assinatura: 'pelo_nome', dataFim: '2026-09-30' }), doc({ tipo: 'bpo' })], null);
    expect(textoDoDistrato(paraDistratoDTO(r))).toBe('Distrato (serviços até 30/09/2026), assinado; Distrato do BPO');
    expect(textoDoDistrato(null)).toBe('');
  });
});
