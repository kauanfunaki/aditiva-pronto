// Cria uma conta de setor ou gera uma senha nova para ela.
// A senha é gerada aqui (forte) e aparece UMA vez no terminal; o banco guarda só o hash.
//
//   npm --prefix src/backend run conta -- --login societario --nome "Societário"
//   npm --prefix src/backend run conta -- --login societario --nova-senha
//
// --nova-senha também derruba todas as sessões abertas da conta (todo mundo entra de novo).
// Lê as credenciais do banco do .env da raiz do projeto (ou de --env <arquivo>).

import path from 'path';
import dotenv from 'dotenv';

function argumento(nome: string): string | undefined {
  const i = process.argv.indexOf(`--${nome}`);
  if (i < 0) return undefined;
  const valor = process.argv[i + 1];
  return valor && !valor.startsWith('--') ? valor : '';
}

function sair(mensagem: string): never {
  console.error(mensagem);
  process.exit(1);
}

async function main() {
  const arquivoEnv = argumento('env') || path.resolve(__dirname, '../../../.env');
  dotenv.config({ path: arquivoEnv });

  // Depois do dotenv: o pool lê as variáveis na primeira chamada.
  const { getPool } = await import('../src/database/connection');
  const repo = await import('../src/repositories/usuariosRepository');
  const { gerarHashSenha, gerarSenha } = await import('../src/services/senha');

  const login = (argumento('login') ?? '').trim().toLowerCase();
  const nome = (argumento('nome') ?? '').trim();
  const novaSenha = process.argv.includes('--nova-senha');

  if (!/^[a-z0-9._@-]{3,100}$/.test(login)) {
    sair('Informe --login com 3 a 100 caracteres (letras minúsculas, números, ponto, hífen, _ ou @).');
  }

  try {
    const existente = await repo.buscarContaPorLogin(login);
    const senha = gerarSenha();
    const hash = await gerarHashSenha(senha);
    const agora = new Date();

    if (novaSenha) {
      if (!existente) sair(`A conta "${login}" não existe. Para criar, use --nome em vez de --nova-senha.`);
      await repo.gravarSenha(existente.id, hash, agora);
      const derrubadas = await repo.apagarSessoesDaConta(existente.id);
      console.log(`Senha nova da conta "${login}" (${existente.nome}). ${derrubadas} sessão(ões) aberta(s) encerrada(s).`);
    } else {
      if (existente) sair(`A conta "${login}" já existe. Para trocar a senha, use --nova-senha.`);
      if (nome.length < 2) sair('Informe --nome (ex.: --nome "Societário").');
      await repo.inserirConta({ login, nome, senhaHash: hash, agora });
      console.log(`Conta "${login}" (${nome}) criada.`);
    }

    console.log('\nSenha (aparece só agora; repasse ao setor por um canal seguro):\n');
    console.log(`  ${senha}\n`);
  } finally {
    await getPool().end();
  }
}

main().catch((err) => {
  console.error('Falhou:', err instanceof Error ? err.message : err);
  process.exit(1);
});
