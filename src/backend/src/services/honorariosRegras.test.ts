import { describe, expect, it } from 'vitest';
import {
  compararComAcessorias, escolherHonorario, formatoAcessorias, minutaPeloNome, nomeBase, situacaoDoHonorario,
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

  it('contrato mais novo, com texto, sem valor lido pede conferência', () => {
    const semValor = doc({ nome: 'CONTRATO NOVO.pdf', data: '2025-08-01' });
    expect(escolherHonorario([contrato2022, semValor]).alertas).toContain('documento_mais_novo_sem_valor');
  });

  describe('arquivo mais recente é foto (caso real BIOOSCARE, 05/10/2026)', () => {
    const word = doc({ nome: 'CONTRATO ABERTURA DE EMPRESA MARLI.docx', data: '2023-08-30', valor: 660, forma: 'valor_mensal' });
    const foto = doc({
      nome: 'CONTRATO DE PRESTACAO DE SERVICO MARLI ASSINADO.pdf', estado: 'sem_texto', data: null,
      modificadoEm: new Date('2023-10-18T12:00:00Z'),
    });

    it('PDF escaneado mais novo que o documento do valor: alerta próprio e aponta o arquivo', () => {
      const r = escolherHonorario([word, foto]);
      expect(r.documento?.valor).toBe(660);
      expect(r.alertas).toContain('mais_recente_digitalizado');
      expect(r.alertas).not.toContain('documento_mais_novo_sem_valor');
      expect(r.fotoMaisNova?.nome).toBe(foto.nome);
      expect(situacaoDoHonorario([word, foto], r, false).situacao).toBe('CONFERIR');
    });

    it('foto (.jpeg) de aditivo também conta', () => {
      const jpeg = doc({ nome: 'X - Termo Aditivo Assinado.jpeg', tipo: 'aditivo', estado: 'imagem', data: null, modificadoEm: new Date('2026-03-10T12:00:00Z') });
      expect(escolherHonorario([word, jpeg]).alertas).toContain('mais_recente_digitalizado');
    });

    it('foto mais antiga que o documento do valor não alerta', () => {
      const antiga = { ...foto, modificadoEm: new Date('2023-01-01T12:00:00Z') };
      expect(escolherHonorario([word, antiga]).alertas).not.toContain('mais_recente_digitalizado');
    });

    it('a versão escaneada do próprio Word (mesmo nome + "assinado") não alerta', () => {
      const gemeo = { ...foto, nome: 'CONTRATO ABERTURA DE EMPRESA MARLI - assinado.pdf' };
      expect(escolherHonorario([word, gemeo]).alertas).not.toContain('mais_recente_digitalizado');
    });

    it('minuta e "outro" (acordo, proposta) escaneados não alertam', () => {
      expect(escolherHonorario([word, { ...foto, minuta: true }]).alertas).not.toContain('mais_recente_digitalizado');
      expect(escolherHonorario([word, { ...foto, tipo: 'outro' }]).alertas).not.toContain('mais_recente_digitalizado');
    });
  });

  it('nomeBase ignora extensão, acento, "assinado" e "(1)"', () => {
    expect(nomeBase('Contrato Prestação - assinado (1).PDF')).toBe(nomeBase('contrato prestacao.docx'));
  });

  it('desempate na mesma data: aditivo antes de contrato, assinado antes de não assinado', () => {
    const cont = doc({ nome: 'c.pdf', data: '2025-01-01', valor: 100, forma: 'valor_mensal' });
    const adit = doc({ nome: 'a.pdf', tipo: 'aditivo', data: '2025-01-01', valor: 100, forma: 'novo_valor' });
    expect(escolherHonorario([cont, adit]).documento?.nome).toBe('a.pdf');
  });
});

describe('situacaoDoHonorario', () => {
  const informado = { valor: 600, informadoEm: new Date('2026-10-05T12:00:00Z') };
  const sit = (docs: DocumentoDaEmpresa[], manual = false) =>
    situacaoDoHonorario(docs, escolherHonorario(docs), manual ? informado : null).situacao;

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
    const r = situacaoDoHonorario([contrato2022, doc({ estado: 'pendente' })], escolherHonorario([contrato2022]), null);
    expect(r).toEqual({ situacao: 'CONFERIR', alertas: ['leitura_incompleta'] });
  });

  describe('valor informado à mão (digitado ou "Acessórias está certo")', () => {
    it('os alertas da leitura não contam: uma pessoa já decidiu', () => {
      const condicional = doc({ valor: 1621, forma: 'valor_mensal', condicional: true, modificadoEm: new Date('2026-06-01T12:00:00Z') });
      const r = situacaoDoHonorario([condicional], escolherHonorario([condicional]), informado);
      expect(r).toEqual({ situacao: 'MANUAL', alertas: [] });
    });

    it('documento com outro valor chegou depois: avisa', () => {
      const aditivo2027 = doc({ tipo: 'aditivo', valor: 700, forma: 'novo_valor', data: '2027-01-10', modificadoEm: new Date('2027-01-12T12:00:00Z') });
      const r = situacaoDoHonorario([contrato2022, aditivo2027], escolherHonorario([contrato2022, aditivo2027]), informado);
      expect(r).toEqual({ situacao: 'MANUAL', alertas: ['documento_depois_do_informado'] });
    });

    it('documento novo com o mesmo valor, minuta ou acordo: não avisa', () => {
      const depois = new Date('2027-01-12T12:00:00Z');
      const docs = [
        doc({ tipo: 'aditivo', valor: 600, forma: 'novo_valor', modificadoEm: depois }),
        doc({ valor: 900, forma: 'valor_mensal', minuta: true, modificadoEm: depois }),
        doc({ tipo: 'outro', valor: 900, forma: 'mencao', modificadoEm: depois }),
      ];
      expect(situacaoDoHonorario(docs, escolherHonorario(docs), informado).alertas).toEqual([]);
    });
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

describe('pasta de grupo: contrato de outra empresa não vale (casos reais CECATTO e E R N PEREIRA)', () => {
  const CNPJ = '24.948.431/0001-42';
  const proprio = doc({ nome: 'CONTRATO CECATTO COMERCIO.pdf', data: '2022-08-30', valor: 1200, forma: 'valor_mensal', cnpjs: ['24948431000142'] });
  const deOutra = doc({ nome: 'CONTRATO CECATTO EMBALAGENS.pdf', data: '2023-01-10', valor: 2400, forma: 'valor_mensal', cnpjs: ['47986134000197'] });
  const semCnpjAntigo = doc({ nome: 'CONTRATO - EMPRESA NOVA - WILLIAN.pdf', data: '2022-07-20', valor: 2400, forma: 'valor_mensal', cnpjs: [] });

  it('ignora o contrato que cita só o CNPJ de outra empresa, mesmo sendo mais novo', () => {
    expect(escolherHonorario([proprio, deOutra, semCnpjAntigo], CNPJ).documento?.valor).toBe(1200);
  });

  it('com documento da empresa, os sem CNPJ não são escolhidos; se forem mais novos e diferentes, alerta', () => {
    const semCnpjNovo = doc({ ...semCnpjAntigo, data: '2023-02-01' });
    const r = escolherHonorario([proprio, semCnpjNovo], CNPJ);
    expect(r.documento?.valor).toBe(1200);
    expect(r.alertas).toContain('documento_sem_cnpj');
  });

  it('sem documento com o CNPJ da empresa: vale a regra de sempre, com alerta de CNPJ diferente (DZ PLUS)', () => {
    const comErro = doc({ valor: 1100, forma: 'valor_mensal', cnpjs: ['08846048000163'] });
    const r = escolherHonorario([comErro], '08.486.048/0001-63');
    expect(r.documento?.valor).toBe(1100);
    expect(r.alertas).toContain('cnpj_diferente');
  });

  it('contrato da matriz vale para a filial (mesma raiz do CNPJ)', () => {
    const daMatriz = doc({ valor: 810.5, forma: 'valor_mensal', cnpjs: ['17122471000175'] });
    expect(escolherHonorario([daMatriz], '17.122.471/0021-19').documento?.valor).toBe(810.5);
  });

  it('sem CNPJ em lugar nenhum (texto antigo, digitalizado): regra de antes', () => {
    expect(escolherHonorario([contrato2022, aditivoHon2025], CNPJ).documento?.valor).toBe(1621);
  });
});
