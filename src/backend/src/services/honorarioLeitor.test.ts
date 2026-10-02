import { describe, expect, it } from 'vitest';
import {
  consertarAcentos, dataDoDocumento, lerDocumento, lerHonorario, paraNumero, tipoDoDocumento,
} from './honorarioLeitor';

// Trechos tirados dos documentos reais da rede (02/10/2026), com nomes trocados.

const CONTRATO = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS CONTÁBEIS
CLÁUSULA SEXTA: O (A) CONTRATANTE pagará diretamente à CONTRATADA pelos serviços os
honorários mensais no valor de R$ 600,00 (seiscentos reais), mais o valor adicional de R$ 45,00
(quarenta e cinco reais) por funcionário registrado, com vencimento até o dia 10 (dez) de cada mês.
PARÁGRAFO PRIMEIRO: DESCRIÇÃO DOS HONORÁRIOS CONTÁBEIS CONFORME REGIME TRIBUTÁRIO a) Simples
Nacional Micro Empresa (faturamento anual até R$ 360 mil) - R$ 353,00
Curitiba, 05 de maio de 2026.`;

const ADITIVO_NOVO_VALOR = `TERMO ADITIVO AO CONTRATO DE PRESTAÇÃO DE SERVIÇOS
CLÁUSULA PRIMEIRA - DA ALTERAÇÃO DO VALOR DOS HONORÁRIOS: O presente Termo Aditivo tem por objetivo
o ajuste de valor dos honorários profissionais mensais. Parágrafo Primeiro: O valor do honorário
mensal, anteriormente fixado em R$ 257,81 (duzentos e cinquenta e sete reais e oitenta e um
centavos), passa a ser de R$ 1.199,14 (um mil cento e noventa e nove reais e catorze centavos).
Curitiba, 09 de abril de 2026.`;

const ADITIVO_RESPONSAVEL_TECNICO = `TERMO ADITIVO AO CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE CONTABILIDADE
CLÁUSULA PRIMEIRA: A CONTRATADA informa a substituição de seu profissional responsável técnico.
CLÁUSULA SEGUNDA: Permanecem inalteradas e em vigor todas as demais cláusulas.
Curitiba, 11 de maio de 2026.`;

const ADITIVO_13 = `TERMO ADITIVO. No mês de dezembro de cada ano será cobrado 1 (um) honorário mensal adicional,
para atendimento de serviços e encargos próprios do período ao final do exercício.`;

describe('lerHonorario', () => {
  it('contrato: valor da cláusula e adicional por funcionário (ignora a tabela de faixas)', () => {
    const l = lerHonorario(CONTRATO)!;
    expect(l.valor).toBe(600);
    expect(l.adicionalPorFuncionario).toBe(45);
    expect(l.forma).toBe('valor_mensal');
    expect(l.condicional).toBe(false);
    expect(l.trecho).toContain('R$ 600,00');
  });

  it('aditivo de honorário: pega o valor NOVO, não o anterior', () => {
    const l = lerHonorario(ADITIVO_NOVO_VALOR)!;
    expect(l.valor).toBe(1199.14);
    expect(l.forma).toBe('novo_valor');
  });

  it('"passarão a ser de"', () => {
    expect(lerHonorario('os honorários mensais pelos serviços contábeis prestados passarão a ser de R$ 3.240,00 (três mil)')!.valor).toBe(3240);
  });

  it('aditivos sem valor (responsável técnico, 13º) não têm honorário', () => {
    expect(lerHonorario(ADITIVO_RESPONSAVEL_TECNICO)).toBeNull();
    expect(lerHonorario(ADITIVO_13)).toBeNull();
  });

  it('modelo com o valor em branco não pega a tabela de faixas', () => {
    const modelo = CONTRATO.replace('R$ 600,00 (seiscentos reais)', 'R$ ............................... (..................)');
    expect(lerHonorario(modelo)).toBeNull();
  });

  it('formatos encontrados: "R$ R$", sem centavos, ponto decimal, "valor inicial"', () => {
    expect(lerHonorario('honorários mensais no valor de R$ R$ 405,25 (quatrocentos)')!.valor).toBe(405.25);
    expect(lerHonorario('os honorários mensais no valor de R$ 1621, mais o valor adicional')!.valor).toBe(1621);
    expect(lerHonorario('prestados os honorários mensais de R$ 15000.00 (quinze mil reais)')!.valor).toBe(15000);
    expect(lerHonorario('os honorários mensais no valor inicial de R$ 600,00 (seiscentos reais)')!.valor).toBe(600);
    expect(lerHonorario('os honorários mensais de R$ R$ 1.100,00 (hum mil e cem reais)')!.valor).toBe(1100);
  });

  it('acordo comercial: "Honorário contábil: R$ 600,00" sai como menção', () => {
    const l = lerHonorario('1) Termos comerciais: Cadastro: vide cartão CNPJ  Honorário contábil: R$ 600,00  Honorário adm da folha: 45,00')!;
    expect(l.valor).toBe(600);
    expect(l.forma).toBe('mencao');
  });

  it('faixa de faturamento ("R$ 360 mil", "R$ 65K") não é honorário', () => {
    expect(lerHonorario('Honorários contábeis: R$ 360 mil de faturamento anual')).toBeNull();
    expect(lerHonorario('Honorário estimado R$ 65K de faturamento')).toBeNull();
  });

  it('valor amarrado a faixa de faturamento é marcado como condicional', () => {
    const t = 'O valor total deste contrato é de R$ 1.621,00. Entretanto, enquanto o faturamento mensal do CLIENTE não ultrapassar R$ 150.000,00, o valor devido será de R$ 810,50. Os honorários passam a ser de R$ 1.621,00.';
    expect(lerHonorario(t)!.condicional).toBe(true);
  });

  it('PDF com acento trocado (fonte MacRoman) ainda é lido', () => {
    const t = 'CL¡USULA SEXTA: O (A) CONTRATANTE pagar· diretamente ‡ CONTRATADA pelos serviÁos os honor·rios mensais no valor de R$ 353,00 (trezentos e cinquenta e trÍs reais), mais o valor adicional de R$ 45,00 por funcion·rio';
    const l = lerHonorario(t)!;
    expect(l.valor).toBe(353);
    expect(l.adicionalPorFuncionario).toBe(45);
    expect(l.trecho).toContain('honorários mensais');
  });
});

describe('consertarAcentos', () => {
  it('conserta só texto com sinais claros de MacRoman', () => {
    expect(consertarAcentos('CL¡USULA ser„o serviÁos pagar· ‡ CONTRATADA')).toBe('CLÁUSULA serão serviços pagará à CONTRATADA');
    const normal = 'ÁGUA e Ética – Curitiba · R$ 10,00';
    expect(consertarAcentos(normal)).toBe(normal);
  });
});

describe('paraNumero', () => {
  it.each([
    ['1.412,00', 1412], ['600,00', 600], ['1621', 1621], ['15000.00', 15000], ['1.412', 1412],
    ['12.345.678,90', 12345678.9], ['600.', 600],
  ])('%s → %d', (t, n) => expect(paraNumero(t)).toBe(n));

  it('formato sem sentido vira NaN', () => {
    expect(paraNumero('1.41.2,00')).toBeNaN();
  });
});

describe('dataDoDocumento', () => {
  it('usa a ÚLTIMA data por extenso (a da assinatura)', () => {
    const t = 'contrato firmado em 26 de março de 2024 ... Curitiba, 05 de maio de 2026.';
    expect(dataDoDocumento(t)).toBe('2026-05-05');
  });

  it('ignora data impossível e fora do intervalo', () => {
    expect(dataDoDocumento('31 de fevereiro de 2026')).toBeNull();
    expect(dataDoDocumento('05 de maio de 1999')).toBeNull();
    expect(dataDoDocumento('05 de maio de 2099', new Date('2026-10-02'))).toBeNull();
  });

  it('aceita "1º" e março com acento trocado', () => {
    expect(dataDoDocumento('Curitiba, 1º de marÁo de 2025')).toBe('2025-03-01');
  });
});

describe('tipoDoDocumento', () => {
  it('pelo título do texto, depois pelo nome', () => {
    expect(tipoDoDocumento(ADITIVO_NOVO_VALOR, 'qualquer.pdf')).toBe('aditivo');
    expect(tipoDoDocumento(CONTRATO, 'qualquer.pdf')).toBe('contrato');
    expect(tipoDoDocumento('', 'EMPRESA - Termo Adtivo.pdf')).toBe('aditivo');
    expect(tipoDoDocumento('', 'CONTRATO EMPRESA.pdf')).toBe('contrato');
    expect(tipoDoDocumento('', 'outro.pdf')).toBe('outro');
  });

  it('acordo comercial e proposta não são contrato, mesmo citando contrato', () => {
    expect(tipoDoDocumento('Termos comerciais para realização do contrato de prestação de serviços', 'ACORDO SKAY - X.pdf')).toBe('outro');
  });
});

describe('lerDocumento', () => {
  it('junta tipo, data e leitura', () => {
    const r = lerDocumento(ADITIVO_NOVO_VALOR, 'X - Termo Aditivo Honorario.pdf');
    expect(r).toMatchObject({ tipo: 'aditivo', data: '2026-04-09', leitura: { valor: 1199.14 } });
  });
});
