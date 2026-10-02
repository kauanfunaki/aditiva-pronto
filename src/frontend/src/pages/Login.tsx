import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeSlash, SignIn, Spinner } from '@phosphor-icons/react';
import { entrar } from '../services/api';
import { definirSessao } from '../services/queryClient';
import { useTheme } from '../hooks/useTheme';
import { ThemeToggle } from '../components/ThemeToggle';

export default function Login() {
  const { theme, toggle } = useTheme();
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [verSenha, setVerSenha] = useState(false);

  const mutacao = useMutation({
    mutationFn: () => entrar(login.trim(), senha),
    onSuccess: (usuario) => {
      setSenha('');
      definirSessao(usuario);
    },
  });

  function enviar(e: FormEvent) {
    e.preventDefault();
    if (!login.trim() || !senha || mutacao.isPending) return;
    mutacao.mutate();
  }

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-zinc-950">
      <div className="flex justify-end p-4">
        <ThemeToggle theme={theme} onToggle={toggle} />
      </div>

      <main className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-8">
            <img src="/logo-blue.png" alt="" className="h-12 w-12 object-contain dark:hidden" />
            <img src="/logo-white.png" alt="" className="hidden h-12 w-12 object-contain dark:block" />
            <h1 className="mt-4 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
              Aditiva Pronto
            </h1>
            <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">
              Entre com a conta do seu setor.
            </p>
          </div>

          <form onSubmit={enviar} className="card space-y-5" noValidate>
            <div>
              <label htmlFor="login" className="label">Conta</label>
              <input
                id="login"
                name="username"
                className="input min-h-[44px]"
                value={login}
                onChange={(e) => setLogin(e.target.value)}
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="societario ou controladoria"
                required
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="senha" className="label">Senha</label>
              <div className="relative">
                <input
                  id="senha"
                  name="password"
                  type={verSenha ? 'text' : 'password'}
                  className="input min-h-[44px] pr-12"
                  value={senha}
                  onChange={(e) => setSenha(e.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  onClick={() => setVerSenha((v) => !v)}
                  className="absolute inset-y-0 right-0 w-11 flex items-center justify-center rounded-r-lg
                             text-gray-500 hover:text-gray-800 dark:text-zinc-400 dark:hover:text-zinc-100
                             focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                  aria-label={verSenha ? 'Esconder senha' : 'Mostrar senha'}
                  aria-pressed={verSenha}
                >
                  {verSenha ? <EyeSlash size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
                </button>
              </div>
            </div>

            {mutacao.isError && (
              <p role="alert" className="text-sm text-red-700 dark:text-red-400">
                {mutacao.error.message}
              </p>
            )}

            <button
              type="submit"
              className="btn-primary w-full justify-center min-h-[44px]"
              disabled={!login.trim() || !senha || mutacao.isPending}
            >
              {mutacao.isPending
                ? <Spinner size={18} className="animate-spin" aria-hidden />
                : <SignIn size={18} aria-hidden />}
              {mutacao.isPending ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          <p className="mt-6 text-center text-xs text-gray-500 dark:text-zinc-500">
            Esqueceu a senha? Peça uma nova a quem cuida do app.
          </p>
        </div>
      </main>
    </div>
  );
}
