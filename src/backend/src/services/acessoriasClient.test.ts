import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _zerarFila, buscarEmpresa, erroNoCorpo, ErroAcessorias, gravarEmpresa, listarPagina, mensagemDe,
} from './acessoriasClient';

// O Acessórias responde erro com HTTP 200 e {"Erro": "…"} no corpo (documentação da API).
// Antes desta regra o app tratava esse 200 como sucesso e só via na releitura que nada mudou.

function responder(corpo: unknown, status = 200) {
  const fetchFalso = vi.fn(async () => new Response(JSON.stringify(corpo), { status }));
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

beforeEach(() => {
  process.env.ACESSORIAS_API_TOKEN = 'token-de-teste-com-mais-de-16';
  _zerarFila();
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.ACESSORIAS_API_TOKEN;
});

describe('erroNoCorpo e mensagemDe', () => {
  it('acha a chave de erro sem diferenciar maiúscula', () => {
    expect(erroNoCorpo({ Erro: 'Sem permissão para alterar empresas' })).toBe('Sem permissão para alterar empresas');
    expect(erroNoCorpo({ error: 'x' })).toBe('x');
    expect(erroNoCorpo({ id: '214', msg: 'Empresa 214 atualizada com sucesso!' })).toBeNull();
    expect(erroNoCorpo([{ Erro: 'x' }])).toBeNull();
    expect(erroNoCorpo({ Erro: '' })).toBeNull();
  });

  it('mensagem: o erro vence; depois msg/message', () => {
    expect(mensagemDe({ Erro: 'falhou', msg: 'ok' }, 200)).toBe('falhou');
    expect(mensagemDe({ msg: 'Empresa 1 atualizada com sucesso!' }, 200)).toBe('Empresa 1 atualizada com sucesso!');
    expect(mensagemDe(null, 500)).toBe('O Acessórias respondeu HTTP 500.');
  });
});

describe('gravarEmpresa', () => {
  it('HTTP 200 com {"Erro"} vira exceção com a mensagem do Acessórias', async () => {
    responder({ Erro: 'Campo honorario inválido' });
    await expect(gravarEmpresa({ cnpj: '47.794.801/0001-30', honorario: '759.00' }))
      .rejects.toThrow(ErroAcessorias);
    responder({ Erro: 'Campo honorario inválido' });
    await expect(gravarEmpresa({ cnpj: '47.794.801/0001-30', honorario: '759.00' }))
      .rejects.toThrow('Campo honorario inválido');
  });

  it('sucesso devolve a mensagem e manda form-data com Bearer', async () => {
    const f = responder({ id: '214', msg: 'Empresa 214 atualizada com sucesso!' });
    expect(await gravarEmpresa({ cnpj: '47.794.801/0001-30', honorario: '759.00' }))
      .toBe('Empresa 214 atualizada com sucesso!');
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.acessorias.com/companies');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-de-teste-com-mais-de-16');
    expect((init.body as FormData).get('honorario')).toBe('759.00');
  });
});

describe('buscarEmpresa e listarPagina', () => {
  it('"não encontrada" no corpo = null; outro erro = exceção', async () => {
    responder({ Erro: 'Empresa não encontrada' });
    expect(await buscarEmpresa('47794801000130')).toBeNull();
    responder({ Erro: 'Token sem permissão' });
    await expect(buscarEmpresa('47794801000130')).rejects.toThrow('Token sem permissão');
  });

  it('erro no corpo encerra a paginação sem derrubar a conferência', async () => {
    responder({ Erro: 'Nenhuma empresa encontrada' });
    expect(await listarPagina(30)).toEqual([]);
  });
});
