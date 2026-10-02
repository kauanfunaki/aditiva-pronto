import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { DURACAO_SESSAO_MS, novoTokenDeSessao, type UsuarioLogado } from '../middleware/sessao';
import * as repo from '../repositories/usuariosRepository';
import { Limitador } from '../utils/limitador';
import { logger } from '../utils/logger';
import { SENHA_MAX, hashParaComparacaoFicticia, senhaConfere } from './senha';

export const loginSchema = z.object({
  login: z.string().trim().toLowerCase().min(1, 'Informe a conta.').max(100),
  senha: z.string().min(1, 'Informe a senha.').max(SENHA_MAX),
});

const QUINZE_MIN = 15 * 60 * 1000;
// As contas são compartilhadas e o escritório sai por um IP só: um limite por conta
// travaria o setor inteiro (e deixaria qualquer um travá-lo de fora). Por isso o limite
// é por IP + conta, com folga; a defesa principal é a senha gerada (~93 bits).
const porIpEConta = new Limitador(10, QUINZE_MIN);
const porIp       = new Limitador(50, QUINZE_MIN);

const LOGIN_RECUSADO = 'Conta ou senha incorretas.';

export async function entrar(dados: {
  login: string; senha: string; ip: string | null; userAgent: string | null;
}): Promise<{ token: string; usuario: Omit<UsuarioLogado, 'sessaoId'> }> {
  const ip = dados.ip ?? '?';
  const chaveConta = `${ip}|${dados.login}`;
  if (porIpEConta.bloqueado(chaveConta) || porIp.bloqueado(ip)) {
    throw new AppError(429, 'Muitas tentativas erradas. Espere 15 minutos e tente de novo.');
  }

  const conta = await repo.buscarContaPorLogin(dados.login);
  // Mesmo trabalho com ou sem conta: o tempo de resposta não revela quais existem.
  const confere = await senhaConfere(dados.senha, conta?.senhaHash ?? await hashParaComparacaoFicticia());

  if (!conta || !conta.ativo || !confere) {
    porIpEConta.registrarFalha(chaveConta);
    porIp.registrarFalha(ip);
    logger.warn(`[auth] login recusado para "${dados.login}" (ip ${ip})`);
    throw new AppError(401, LOGIN_RECUSADO);
  }

  porIpEConta.limpar(chaveConta);
  const agora = new Date();
  const { token, id } = novoTokenDeSessao();
  await repo.apagarSessoesVencidas(agora);
  await repo.criarSessao({
    id, usuarioId: conta.id, agora, expiraEm: new Date(agora.getTime() + DURACAO_SESSAO_MS),
    ip: dados.ip, userAgent: dados.userAgent,
  });
  await repo.marcarLogin(conta.id, agora);
  logger.info(`[auth] login na conta ${conta.login} (ip ${ip})`);

  return { token, usuario: { id: conta.id, login: conta.login, nome: conta.nome } };
}

export async function sair(sessaoId: string): Promise<void> {
  await repo.apagarSessao(sessaoId);
}
