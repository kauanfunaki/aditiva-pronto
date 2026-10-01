import { describe, expect, it } from 'vitest';
import {
  agruparPorNome, filialDaPasta, indexarEmpresas, indexarPastas, nomeBaseDaPasta, ordemDoCnpj,
  sugerirEmpresas, sugerirPastas, vinculoAutomatico,
} from './auditVinculo';

const empresas = indexarEmpresas([
  { id: 'allmetal',   razaoSocial: 'ALLMETAL LTDA',                              cnpj: '11.111.111/0001-11' },
  { id: 'cea',        razaoSocial: 'C E A CONSTRUTORA LTDA',                     cnpj: '22.222.222/0001-22' },
  // Matriz e filiais: mesma razão social no Domínio.
  { id: 'bld-matriz', razaoSocial: 'BLD LOGISTICA LTDA',                         cnpj: '33.333.333/0001-33' },
  { id: 'bld-12',     razaoSocial: 'BLD LOGISTICA LTDA',                         cnpj: '33.333.333/0012-33' },
  { id: 'bld-15',     razaoSocial: 'BLD LOGISTICA LTDA',                         cnpj: '33.333.333/0015-33' },
  { id: 'cic',        razaoSocial: 'CIC TRANSPORTES RODOVIARIOS DE CARGAS LTDA', cnpj: '44.444.444/0001-44' },
]);
const porNome = agruparPorNome(empresas);

describe('ordemDoCnpj', () => {
  it('lê a ordem do estabelecimento', () => {
    expect(ordemDoCnpj('33.333.333/0012-33')).toBe(12);
    expect(ordemDoCnpj('33333333000133')).toBe(1);
    expect(ordemDoCnpj('123.456.789-00')).toBeNull();
  });
});

describe('filialDaPasta e nomeBaseDaPasta', () => {
  it.each([
    ['BLD LOGÍSTICA LTDA - 12 FILIAL - CURITIBA-PR',               12, 'BLD LOGISTICA'],
    ['X ONE LOGÍSTICA LTDA - 02 FILIAL - SÃO MIGUEL DO OESTE-SC',  2,  'X ONE LOGISTICA'],
    ['BLD LOGISTICA FILIAL 15',                                    15, 'BLD LOGISTICA'],
    ['MH EXPRESS FILIAL 0002',                                     2,  'MH EXPRESS'],
    ['FLASH TRANSPORTES LTDA - MATRIZ',                            1,  'FLASH TRANSPORTES'],
    ['DANILO GABRIEL TOMBINI ENGENHARIA LTDA FILIAL',              null, 'DANILO GABRIEL TOMBINI ENGENHARIA'],
    ['ALLMETAL LTDA',                                              null, 'ALLMETAL'],
  ])('"%s" → filial %s, base "%s"', (pasta, filial, base) => {
    expect(filialDaPasta(pasta)).toBe(filial);
    expect(nomeBaseDaPasta(pasta)).toBe(base);
  });
});

describe('vinculoAutomatico', () => {
  it('vincula quando o nome normalizado bate com uma única empresa', () => {
    expect(vinculoAutomatico('ALLMETAL LTDA', porNome)).toBe('allmetal');
    expect(vinculoAutomatico('C&A CONSTRUTORA LTDA', porNome)).toBe('cea');
  });

  it('não vincula quando a razão social se repete e a pasta não diz a filial', () => {
    expect(vinculoAutomatico('BLD LOGÍSTICA LTDA', porNome)).toBeNull();
  });

  it('vincula a filial pela ordem do CNPJ quando o nome-base bate', () => {
    expect(vinculoAutomatico('BLD LOGÍSTICA LTDA - 12 FILIAL - CURITIBA-PR', porNome)).toBe('bld-12');
    expect(vinculoAutomatico('BLD LOGISTICA LTDA - 15 FILIAL - MAFRA-SC', porNome)).toBe('bld-15');
  });

  it('não vincula filial cujo número não existe entre os CNPJs', () => {
    expect(vinculoAutomatico('BLD LOGÍSTICA LTDA - 14 FILIAL - MAFRA-SC', porNome)).toBeNull();
  });

  it('não vincula por nome apenas parecido', () => {
    expect(vinculoAutomatico('TRANSCIC TRANSPORTES RODOVIÁRIOS DE CARGAS LTDA', porNome)).toBeNull();
  });

  it('não vincula pasta que não é cliente', () => {
    expect(vinculoAutomatico('SCANNER', porNome)).toBeNull();
    expect(vinculoAutomatico('(sem nome)', porNome)).toBeNull();
  });
});

describe('sugerirEmpresas', () => {
  it('sugere a parecida, mas deixa a decisão para uma pessoa', () => {
    const s = sugerirEmpresas('TRANSCIC TRANSPORTES RODOVIÁRIOS DE CARGAS LTDA', empresas);
    expect(s[0].id).toBe('cic');
    expect(s[0].similaridade).toBeGreaterThan(0.85);
    expect(s[0].filialConfere).toBe(false);
  });

  it('em pasta de filial, põe primeiro a empresa com a mesma ordem no CNPJ', () => {
    const s = sugerirEmpresas('BLD LOGÍSTICA LTDA - 14 FILIAL - MAFRA-SC', empresas);
    expect(s).toHaveLength(3);
    expect(s.every((e) => e.id.startsWith('bld-'))).toBe(true);
    expect(s.some((e) => e.filialConfere)).toBe(false);

    const s12 = sugerirEmpresas('BLD LOGÍSTICA LTDA - 12 FILIAL - CURITIBA-PR', empresas);
    expect(s12[0]).toMatchObject({ id: 'bld-12', filialConfere: true });
  });

  it('respeita limite e similaridade mínima', () => {
    expect(sugerirEmpresas('ALLMETAL LTDA', empresas, 1)).toHaveLength(1);
    expect(sugerirEmpresas('CERTIFICADOS', empresas)).toEqual([]);
    expect(sugerirEmpresas('', empresas)).toEqual([]);
  });
});

describe('sugerirPastas (empresa → pasta)', () => {
  const pastas = indexarPastas([
    'BLD LOGÍSTICA LTDA - 12 FILIAL - CURITIBA-PR',
    'BLD LOGÍSTICA LTDA - 15 FILIAL - MAFRA-SC',
    'BLD EXPRESS LTDA',
    'ALLMETAL LTDA',
    'SCANNER',
  ]);
  const empresa = (id: string) => empresas.find((e) => e.id === id)!;

  it('põe primeiro a pasta da filial com a mesma ordem do CNPJ', () => {
    const s = sugerirPastas(empresa('bld-15'), pastas);
    expect(s[0]).toMatchObject({ nomePasta: 'BLD LOGÍSTICA LTDA - 15 FILIAL - MAFRA-SC', filialConfere: true });
    expect(s.some((p) => p.nomePasta === 'SCANNER')).toBe(false);
  });

  it('sugere pelo nome quando não é filial', () => {
    expect(sugerirPastas(empresa('allmetal'), pastas)[0]).toMatchObject({ nomePasta: 'ALLMETAL LTDA', filialConfere: false });
  });

  it('não sugere nada parecido de menos', () => {
    expect(sugerirPastas(empresa('cea'), pastas)).toEqual([]);
  });
});

describe('filial só desempata entre nomes praticamente iguais (caso real AJL × MH EXPRESS)', () => {
  const ajl = indexarEmpresas([
    { id: 'ajl-02', razaoSocial: 'AJL TRANSPORTES EXPRESS LTDA', cnpj: '38.075.242/0002-06' },
    { id: 'mh-01',  razaoSocial: 'MH EXPRESS TRANSPORTES LTDA',  cnpj: '55.555.555/0001-55' },
  ]);

  it('empresa → pasta: a pasta de mesmo nome vence a de outra empresa com o mesmo número de filial', () => {
    const s = sugerirPastas(ajl[0], indexarPastas([
      'MH EXPRESS TRANSPORTES LTDA - 02 FILIAL SP (baixada)',
      'AJL TRANSPORTES EXPRESS LTDA',
    ]));
    expect(s[0]).toMatchObject({ nomePasta: 'AJL TRANSPORTES EXPRESS LTDA' });
    expect(s.find((p) => p.nomePasta.startsWith('MH'))?.filialConfere).toBe(false);
  });

  it('pasta → empresa: idem', () => {
    const s = sugerirEmpresas('MH EXPRESS TRANSPORTES LTDA - 02 FILIAL SP', ajl);
    expect(s[0].id).toBe('mh-01');
    expect(s.find((e) => e.id === 'ajl-02')?.filialConfere ?? false).toBe(false);
  });
});
