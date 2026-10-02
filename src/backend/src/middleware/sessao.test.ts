import { afterEach, describe, expect, it } from 'vitest';
import type { Response } from 'express';
import {
  apagarCookie, gravarCookie, idDaSessao, lerCookie, nomeDoCookie, novoTokenDeSessao, origemConfiavel,
} from './sessao';

afterEach(() => {
  delete process.env.APP_ORIGIN;
  process.env.NODE_ENV = 'test';
});

function pedido(method: string, cabecalhos: Record<string, string>) {
  const h = Object.fromEntries(Object.entries(cabecalhos).map(([k, v]) => [k.toLowerCase(), v]));
  return { method, get: (nome: string) => h[nome.toLowerCase()] } as Parameters<typeof origemConfiavel>[0];
}

function respostaFalsa() {
  const cookies: string[] = [];
  return { cookies, res: { append: (_: string, v: string) => { cookies.push(v); } } as unknown as Response };
}

describe('token de sessão', () => {
  it('gera token aleatório e guarda só o SHA-256 dele', () => {
    const a = novoTokenDeSessao();
    const b = novoTokenDeSessao();
    expect(a.token).not.toBe(b.token);
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.id).toMatch(/^[0-9a-f]{64}$/);
    expect(a.id).toBe(idDaSessao(a.token));
    expect(a.id).not.toContain(a.token);
  });
});

describe('lerCookie', () => {
  const token = 'A'.repeat(43);

  it('acha o cookie certo entre vários', () => {
    expect(lerCookie(`tema=escuro; ap_sessao=${token}; outro=1`, 'ap_sessao')).toBe(token);
  });

  it('não confunde nome parecido', () => {
    expect(lerCookie(`xap_sessao=${token}`, 'ap_sessao')).toBeNull();
  });

  it('recusa valor fora do formato do token', () => {
    expect(lerCookie('ap_sessao=curto', 'ap_sessao')).toBeNull();
    expect(lerCookie(`ap_sessao=${'A'.repeat(30)}%27`, 'ap_sessao')).toBeNull();
    expect(lerCookie(undefined, 'ap_sessao')).toBeNull();
  });
});

describe('cookie', () => {
  it('em produção usa __Host-, Secure, HttpOnly e SameSite=Strict', () => {
    process.env.NODE_ENV = 'production';
    expect(nomeDoCookie()).toBe('__Host-ap_sessao');
    const { cookies, res } = respostaFalsa();
    gravarCookie(res, 'tok');
    expect(cookies[0]).toBe('__Host-ap_sessao=tok; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200; Secure');
  });

  it('em desenvolvimento (http) não marca Secure', () => {
    const { cookies, res } = respostaFalsa();
    gravarCookie(res, 'tok');
    expect(nomeDoCookie()).toBe('ap_sessao');
    expect(cookies[0]).not.toContain('Secure');
  });

  it('apagar zera o cookie', () => {
    const { cookies, res } = respostaFalsa();
    apagarCookie(res);
    expect(cookies[0]).toMatch(/^ap_sessao=; Path=\/; HttpOnly; SameSite=Strict; Max-Age=0$/);
  });
});

describe('origemConfiavel (CSRF)', () => {
  it('leitura sempre passa', () => {
    expect(origemConfiavel(pedido('GET', { 'sec-fetch-site': 'cross-site' }))).toBe(true);
  });

  it('usa o Sec-Fetch-Site quando o navegador manda', () => {
    expect(origemConfiavel(pedido('POST', { 'sec-fetch-site': 'same-origin' }))).toBe(true);
    expect(origemConfiavel(pedido('POST', { 'sec-fetch-site': 'cross-site' }))).toBe(false);
    expect(origemConfiavel(pedido('PUT', { 'sec-fetch-site': 'same-site' }))).toBe(false);
  });

  it('sem Sec-Fetch-Site, compara o Origin com o host', () => {
    expect(origemConfiavel(pedido('POST', { origin: 'https://aditivapronto.41tech.cloud', host: 'aditivapronto.41tech.cloud' }))).toBe(true);
    expect(origemConfiavel(pedido('POST', { origin: 'https://malicioso.com', host: 'aditivapronto.41tech.cloud' }))).toBe(false);
    expect(origemConfiavel(pedido('POST', { origin: 'null', host: 'aditivapronto.41tech.cloud' }))).toBe(false);
  });

  it('aceita origem extra configurada em APP_ORIGIN', () => {
    process.env.APP_ORIGIN = 'http://localhost:5173';
    expect(origemConfiavel(pedido('POST', { origin: 'http://localhost:5173', host: 'localhost:3001' }))).toBe(true);
  });

  it('sem cabeçalho de navegador (curl, script) passa: não há cookie de vítima', () => {
    expect(origemConfiavel(pedido('DELETE', {}))).toBe(true);
  });
});
