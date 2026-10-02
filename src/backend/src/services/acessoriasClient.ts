// Cliente da API do Acessórias (https://api.acessorias.com/documentation).
// Só o servidor fala com o Acessórias: o token (ACESSORIAS_API_TOKEN) nunca vai ao navegador.
// Limite da API: 100 requisições por minuto (janela deslizante). Aqui as chamadas saem em
// fila, uma a cada 700 ms (~85/min), compartilhada por toda operação do app.

import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const URL_PADRAO = 'https://api.acessorias.com';
const INTERVALO_MS = 700;
const TEMPO_LIMITE_MS = 20_000;

export class ErroAcessorias extends Error {
  constructor(message: string, public readonly status: number | null) {
    super(message);
    this.name = 'ErroAcessorias';
  }
}

export function acessoriasConfigurado(): boolean {
  return (process.env.ACESSORIAS_API_TOKEN ?? '').trim().length >= 16;
}

function configuracao() {
  const token = (process.env.ACESSORIAS_API_TOKEN ?? '').trim();
  if (token.length < 16) {
    throw new AppError(503, 'Integração com o Acessórias não configurada no servidor (ACESSORIAS_API_TOKEN).');
  }
  const base = (process.env.ACESSORIAS_API_URL ?? URL_PADRAO).replace(/\/+$/, '');
  return { token, base };
}

let proximaVez = 0;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Reserva a vez na fila (todas as chamadas passam por aqui). */
async function aguardarVez(): Promise<void> {
  const agora = Date.now();
  const minha = Math.max(agora, proximaVez);
  proximaVez = minha + INTERVALO_MS;
  if (minha > agora) await esperar(minha - agora);
}

async function chamar(metodo: 'GET' | 'POST', caminho: string, corpo?: FormData): Promise<{ status: number; dados: unknown }> {
  const { token, base } = configuracao();
  for (let tentativa = 1; ; tentativa++) {
    await aguardarVez();
    let resposta: Response;
    try {
      resposta = await fetch(`${base}${caminho}`, {
        method:  metodo,
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        body:    corpo,
        signal:  AbortSignal.timeout(TEMPO_LIMITE_MS),
      });
    } catch (err) {
      if (tentativa < 3) { await esperar(2000 * tentativa); continue; }
      throw new ErroAcessorias(`Sem resposta do Acessórias: ${(err as Error).message}`, null);
    }

    const texto = await resposta.text();
    let dados: unknown = texto;
    try { dados = texto ? JSON.parse(texto) : null; } catch { /* resposta não é JSON */ }

    if (resposta.status === 429 && tentativa < 4) {
      logger.warn('[acessorias] limite de requisições atingido; aguardando 30 s');
      await esperar(30_000);
      continue;
    }
    if (resposta.status >= 500 && tentativa < 3) { await esperar(2000 * tentativa); continue; }
    return { status: resposta.status, dados };
  }
}

function mensagemDe(dados: unknown, status: number): string {
  if (dados && typeof dados === 'object') {
    const d = dados as Record<string, unknown>;
    const m = d.error ?? d.erro ?? d.msg ?? d.message ?? d.mensagem;
    if (typeof m === 'string' && m.trim()) return m.trim().slice(0, 300);
  }
  if (typeof dados === 'string' && dados.trim()) return dados.trim().slice(0, 300);
  return `O Acessórias respondeu HTTP ${status}.`;
}

/** Ficha da empresa como o Acessórias devolve (chaves em PascalCase: Identificador, Razao, Honorario…). */
export type FichaAcessorias = Record<string, unknown> & {
  ID?: string | number;
  Identificador?: string;
  Razao?: string;
  Fantasia?: string;
  Status?: string;
  Honorario?: string | number | null;
};

function ehFicha(x: unknown): x is FichaAcessorias {
  return !!x && typeof x === 'object' && typeof (x as FichaAcessorias).Identificador === 'string';
}

/** Ficha completa (dados cadastrais, IEs, contatos e departamentos), para comparar antes/depois. */
export async function buscarEmpresa(cnpjDigitos: string): Promise<FichaAcessorias | null> {
  if (!/^\d{11,14}$/.test(cnpjDigitos)) throw new ErroAcessorias('CNPJ/CPF inválido.', null);
  const { status, dados } = await chamar(
    'GET', `/companies/${cnpjDigitos}/?registrationData&stateRegistrations&contacts&departments`,
  );
  if (status === 404) return null;
  if (status >= 400) throw new ErroAcessorias(mensagemDe(dados, status), status);
  if (ehFicha(dados)) return dados;
  if (Array.isArray(dados) && ehFicha(dados[0])) return dados[0];
  return null;
}

/** Uma página do ListAll (20 por página). Lista vazia = acabou. */
export async function listarPagina(pagina: number): Promise<FichaAcessorias[]> {
  const { status, dados } = await chamar('GET', `/companies/ListAll/?Pagina=${pagina}`);
  if (status === 404) return [];
  if (status >= 400) throw new ErroAcessorias(mensagemDe(dados, status), status);
  const lista = Array.isArray(dados)
    ? dados
    : dados && typeof dados === 'object'
      ? Object.values(dados as Record<string, unknown>).find(Array.isArray) ?? Object.values(dados as Record<string, unknown>)
      : [];
  return (lista as unknown[]).filter(ehFicha);
}

/** POST /companies: cria OU atualiza pelo identificador. Só chame com empresa que já existe. */
export async function gravarEmpresa(campos: Record<string, string>): Promise<string> {
  const corpo = new FormData();
  for (const [k, v] of Object.entries(campos)) corpo.append(k, v);
  const { status, dados } = await chamar('POST', '/companies', corpo);
  if (status >= 400) throw new ErroAcessorias(mensagemDe(dados, status), status);
  return mensagemDe(dados, status);
}

/** Honorário da ficha em número ("1412.00" → 1412). */
export function honorarioDaFicha(f: FichaAcessorias | null): number | null {
  if (!f || f.Honorario === null || f.Honorario === undefined || f.Honorario === '') return null;
  const n = Number(String(f.Honorario).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Só para os testes: zera a fila. */
export function _zerarFila(): void {
  proximaVez = 0;
}
