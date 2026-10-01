import { describe, expect, it } from 'vitest';
import { calcularStatusAditivo, type PastaDaEmpresa } from './auditAditivosStatus';
import type { ArquivoParaClassificar } from './auditAditivosClassificador';

const SUB = 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS';
const EM_2026 = new Date('2026-03-24T13:00:00Z');
const EM_2025 = new Date('2025-03-24T13:00:00Z');

function arq(nome: string, extra: Partial<ArquivoParaClassificar> = {}): ArquivoParaClassificar {
  const ext = nome.slice(nome.lastIndexOf('.')).toLowerCase();
  return {
    nome, caminhoRelativo: `${SUB}/${nome}`, ext,
    modificadoEm: EM_2026,
    pdfAssinado:  ext === '.pdf' ? false : null,
    pdfMarca:     null,
    ...extra,
  };
}

const pasta = (...arquivos: ArquivoParaClassificar[]): PastaDaEmpresa =>
  ({ nomePasta: 'ALLMETAL LTDA', subpastasContrato: [SUB], arquivos });

const status = (pastas: PastaDaEmpresa[], ano = 2026) => calcularStatusAditivo(pastas, ano);

describe('calcularStatusAditivo', () => {
  it('sem pasta vinculada', () => {
    expect(status([])).toMatchObject({ status: 'SEM_VINCULO', emDia: false });
  });

  it('pasta sem subpasta de contrato', () => {
    expect(status([{ nomePasta: 'X', subpastasContrato: [], arquivos: [] }]).status).toBe('SEM_PASTA_CONTRATO');
  });

  it('subpasta só com contrato, sem aditivo', () => {
    expect(status([pasta(arq('ALLMETAL - Contrato de Prestação de Serviços.pdf'))]).status).toBe('SEM_ADITIVO');
  });

  it('só o Word gerado: rascunho, ainda não enviado', () => {
    expect(status([pasta(arq('ALLMETAL LTDA - Termo Aditivo.docx'))])).toMatchObject({ status: 'SO_DOCX', emDia: false });
  });

  it('DOCX + PDF exportado sem assinatura', () => {
    const r = status([pasta(arq('ALLMETAL LTDA - Termo Aditivo.docx'), arq('ALLMETAL LTDA - Termo Aditivo.pdf'))]);
    expect(r).toMatchObject({ status: 'PDF_SEM_ASSINATURA', emDia: false });
    expect(r.aditivosDoAno).toHaveLength(2);
  });

  it('decisão 4: "ASS" no nome conta como em dia, com status próprio', () => {
    expect(status([pasta(arq('ALLMETAL LTDA - Termo Aditivo Ass.pdf'))]))
      .toMatchObject({ status: 'ASSINADO_PELO_NOME', emDia: true });
  });

  it('assinatura digital vence qualquer outro arquivo', () => {
    const r = status([pasta(
      arq('ALLMETAL LTDA - Termo Aditivo.docx'),
      arq('ALLMETAL LTDA - Termo Aditivo Ass.pdf'),
      arq('ALLMETAL LTDA - Termo Aditivo Assinado.pdf', { pdfAssinado: true, pdfMarca: 'icp' }),
    )]);
    expect(r).toMatchObject({ status: 'ASSINADO_DIGITAL', emDia: true });
  });

  it('decisão 3: aditivo assinado de outro ano não deixa em dia', () => {
    const r = status([pasta(arq('ALLMETAL LTDA - Termo Aditivo Ass.pdf', { modificadoEm: EM_2025, pdfAssinado: true }))]);
    expect(r).toMatchObject({ status: 'SEM_ADITIVO', emDia: false, ultimoAnoComAditivo: 2025 });
    expect(r.outrosAditivos).toHaveLength(1);
    // …mas deixa em dia quando o ano de referência é o dele
    expect(status([pasta(arq('X - Termo Aditivo.pdf', { modificadoEm: EM_2025, pdfAssinado: true }))], 2025).emDia).toBe(true);
  });

  it('decisão 3: o ano escrito no nome vale mais que a data do arquivo', () => {
    const r = status([pasta(arq('JULLI TRANSPORTES -Termo Aditivo 12.02.2026.pdf', { modificadoEm: EM_2025, pdfAssinado: true }))]);
    expect(r.status).toBe('ASSINADO_DIGITAL');
  });

  it('decisão 5: 13º sozinho não fecha a pendência', () => {
    const r = status([pasta(arq('X - Termo Aditivo 13º.pdf', { pdfAssinado: true }))]);
    expect(r).toMatchObject({ status: 'SEM_ADITIVO', emDia: false, temDecimoTerceiroDoAno: true });
  });

  it('decisão 5: "13º e Honorário" fecha', () => {
    const r = status([pasta(arq('AJAF TRANSPORTES -Termo Aditivo 13º e Honorario.pdf', { pdfAssinado: true }))]);
    expect(r).toMatchObject({ status: 'ASSINADO_DIGITAL', emDia: true, temDecimoTerceiroDoAno: false });
  });

  it('13º não atrapalha quando há o aditivo anual', () => {
    const r = status([pasta(
      arq('X - Termo Aditivo 13º.pdf'),
      arq('X - Termo Aditivo Assinado.pdf', { pdfAssinado: true }),
    )]);
    expect(r).toMatchObject({ status: 'ASSINADO_DIGITAL', temDecimoTerceiroDoAno: true });
    expect(r.outrosAditivos.map((a) => a.nome)).toEqual(['X - Termo Aditivo 13º.pdf']);
  });

  it('modelo não conta', () => {
    expect(status([pasta(arq('MODELO TERMO ADITIVO.docx'))]).status).toBe('SEM_ADITIVO');
  });

  it('empresa com mais de uma pasta: junta os arquivos de todas', () => {
    const r = status([
      { nomePasta: 'X ANTIGA', subpastasContrato: [], arquivos: [] },
      { nomePasta: 'X NOVA', subpastasContrato: [SUB], arquivos: [arq('X - Termo Aditivo Ass.pdf')] },
    ]);
    expect(r.status).toBe('ASSINADO_PELO_NOME');
    expect(r.aditivosDoAno[0].nomePasta).toBe('X NOVA');
  });
});
