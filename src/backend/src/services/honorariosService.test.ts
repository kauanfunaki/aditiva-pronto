import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../repositories/honorariosRepository', () => ({
  cnpjDaEmpresaAtiva: vi.fn(),
  acessoriasDoCnpj:   vi.fn(),
  gravarManual:       vi.fn(),
}));

import * as repo from '../repositories/honorariosRepository';
import { confirmarAcessorias } from './honorariosService';

const EMPRESA = '7b0c8a52-3f1e-4c55-9d7e-2f1a6b9c0d11';
const cnpj = vi.mocked(repo.cnpjDaEmpresaAtiva);
const acessorias = vi.mocked(repo.acessoriasDoCnpj);
const gravar = vi.mocked(repo.gravarManual);

function leitura(honorario: string | null) {
  return { cnpj_digitos: '65199337000115', honorario, lido_em: new Date('2026-10-05T12:00:00Z') } as never;
}

describe('confirmarAcessorias ("Acessórias está certo")', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cnpj.mockResolvedValue('65.199.337/0001-15');
  });

  it('grava o valor da leitura do Acessórias no servidor, com a origem "acessorias"', async () => {
    acessorias.mockResolvedValue(leitura('135.08'));
    const valor = await confirmarAcessorias('controladoria', { companyId: EMPRESA, valorEsperado: 135.08, observacao: 'aditivo de 01/09' });
    expect(valor).toBe(135.08);
    expect(acessorias).toHaveBeenCalledWith('65199337000115');
    expect(gravar).toHaveBeenCalledWith(expect.objectContaining({
      companyId: EMPRESA, valor: 135.08, documento: null, observacao: 'aditivo de 01/09', origem: 'acessorias', conta: 'controladoria',
    }));
  });

  it('recusa se o valor do Acessórias mudou desde que a tela abriu', async () => {
    acessorias.mockResolvedValue(leitura('810.50'));
    await expect(confirmarAcessorias('controladoria', { companyId: EMPRESA, valorEsperado: 135.08, observacao: null }))
      .rejects.toMatchObject({ statusCode: 409 });
    expect(gravar).not.toHaveBeenCalled();
  });

  it('recusa empresa sem honorário no Acessórias, fora da conferência ou inativa', async () => {
    acessorias.mockResolvedValue(leitura('0.00'));
    await expect(confirmarAcessorias('c', { companyId: EMPRESA, valorEsperado: 10, observacao: null })).rejects.toMatchObject({ statusCode: 409 });
    acessorias.mockResolvedValue(null);
    await expect(confirmarAcessorias('c', { companyId: EMPRESA, valorEsperado: 10, observacao: null })).rejects.toMatchObject({ statusCode: 409 });
    cnpj.mockResolvedValue(null);
    await expect(confirmarAcessorias('c', { companyId: EMPRESA, valorEsperado: 10, observacao: null })).rejects.toMatchObject({ statusCode: 404 });
    expect(gravar).not.toHaveBeenCalled();
  });
});
