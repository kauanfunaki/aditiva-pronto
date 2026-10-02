// Hash de senha e geração de senha. Só usa o crypto do Node (sem dependência nativa).
// As senhas são sempre geradas pelo script de contas (não há troca pela tela), então
// nunca existe senha fraca escolhida à mão.
//
// Formato guardado em ap_usuarios.senha_hash:
//   scrypt$<log2 N>$<r>$<p>$<sal base64url>$<hash base64url>
// Os parâmetros vão junto com o hash, então dá para endurecer depois sem
// invalidar as senhas antigas: elas continuam conferindo com os parâmetros delas.

import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'crypto';

const LOG2_N       = 15;          // N = 32768
const R            = 8;
const P            = 1;
const TAM_HASH     = 32;
const TAM_SAL      = 16;
const MEMORIA_MAX  = 64 * 1024 * 1024;

export const SENHA_MAX = 200;

function derivar(senha: string, sal: Buffer, log2N: number, r: number, p: number, tamanho: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(senha.normalize('NFC'), sal, tamanho, { N: 2 ** log2N, r, p, maxmem: MEMORIA_MAX }, (err, chave) => {
      if (err) reject(err);
      else resolve(chave);
    });
  });
}

export async function gerarHashSenha(senha: string): Promise<string> {
  const sal  = randomBytes(TAM_SAL);
  const hash = await derivar(senha, sal, LOG2_N, R, P, TAM_HASH);
  return ['scrypt', LOG2_N, R, P, sal.toString('base64url'), hash.toString('base64url')].join('$');
}

/** Confere em tempo constante. Hash em formato desconhecido nunca confere. */
export async function senhaConfere(senha: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$');
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false;
  const [, log2N, r, p] = partes.slice(0, 4).map(Number);
  if (![log2N, r, p].every(Number.isInteger) || log2N < 10 || log2N > 20 || r < 1 || r > 32 || p < 1 || p > 4) {
    return false;
  }
  const sal      = Buffer.from(partes[4], 'base64url');
  const esperado = Buffer.from(partes[5], 'base64url');
  if (sal.length === 0 || esperado.length === 0) return false;
  const obtido = await derivar(senha, sal, log2N, r, p, esperado.length);
  return timingSafeEqual(obtido, esperado);
}

/**
 * Hash de mentira para quando o e-mail não existe: o login gasta o mesmo tempo
 * com ou sem usuário, e o tempo de resposta não revela quem tem conta.
 */
let hashFicticio: Promise<string> | null = null;
export function hashParaComparacaoFicticia(): Promise<string> {
  hashFicticio ??= gerarHashSenha(randomBytes(16).toString('hex'));
  return hashFicticio;
}

// Sem 0/O, 1/l/I: a senha é lida e digitada por gente.
const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

/** Senha no formato xxxx-xxxx-xxxx-xxxx (~93 bits): forte e fácil de ditar. */
export function gerarSenha(): string {
  const bloco = () => Array.from({ length: 4 }, () => ALFABETO[randomInt(ALFABETO.length)]).join('');
  return [bloco(), bloco(), bloco(), bloco()].join('-');
}
