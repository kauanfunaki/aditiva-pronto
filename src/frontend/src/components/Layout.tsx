import { Outlet, NavLink } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import {
  House, Buildings, ChartBar, GearSix, FolderSimpleUser, FileText, SignOut, UserCircle, CurrencyCircleDollar,
} from '@phosphor-icons/react';
import { useTheme } from '../hooks/useTheme';
import { useSessao } from '../hooks/useSessao';
import { sair } from '../services/api';
import { definirSessao } from '../services/queryClient';
import { ThemeToggle } from './ThemeToggle';

export default function Layout() {
  const { theme, toggle } = useTheme();
  const { usuario } = useSessao();
  const saida = useMutation({
    mutationFn: sair,
    onSettled: () => definirSessao(null),
  });

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-200'
        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
    }`;

  /*
    Logo: usa favicon.png (único arquivo garantidamente presente em public/).
    - Modo claro : exibe como está (ícone colorido sobre fundo branco).
    - Modo escuro: brightness(0) invert(1) → converte para branco sobre fundo escuro.
    Se quiser substituir pela logo oficial, basta colocar o arquivo em
    public/logo-blue.png e trocar src abaixo — o filtro já está pronto.
  */
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-zinc-950">

      {/* ── Top Header ────────────────────────────────────────────── */}
      <header className="h-14 shrink-0 bg-white dark:bg-zinc-900 border-b border-gray-100 dark:border-zinc-800 flex items-center px-5 gap-4 z-10">
        <div className="flex items-center gap-3">
          <img
            src="/logo-blue.png"
            alt="Aditiva Pronto"
            className="h-7 w-7 object-contain dark:hidden"
          />

          <img
            src="/logo-white.png"
            alt="Aditiva Pronto"
            className="hidden h-7 w-7 object-contain dark:block"
          />

          <div className="leading-none">
            <span className="font-bold text-gray-900 dark:text-white text-base tracking-tight">
              Aditiva Pronto
            </span>
            <span className="block text-[10px] text-gray-500 dark:text-slate-300 font-medium tracking-widest uppercase">
              41 Tech
            </span>
          </div>
        </div>

        <div className="flex-1" />

        {usuario && (
          <span className="hidden sm:flex items-center gap-1.5 text-sm text-gray-700 dark:text-zinc-300">
            <UserCircle size={18} weight="duotone" aria-hidden />
            {usuario.nome}
          </span>
        )}
        <ThemeToggle theme={theme} onToggle={toggle} />
        <button
          type="button"
          onClick={() => saida.mutate()}
          disabled={saida.isPending}
          className="btn-ghost px-3 min-h-[40px]"
          title="Sair desta conta neste computador"
        >
          <SignOut size={18} aria-hidden />
          Sair
        </button>
      </header>

      {/* ── Body (sidebar + main) ──────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* Sidebar */}
        <aside className="w-52 shrink-0 bg-white dark:bg-zinc-900 border-r border-slate-200 dark:border-slate-800 flex flex-col">
          <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
            <NavLink to="/" end className={navClass}>
              <House size={17} weight="duotone" />
              Dashboard
            </NavLink>
            <NavLink to="/empresas" className={navClass}>
              <Buildings size={17} weight="duotone" />
              Empresas
            </NavLink>
            <NavLink to="/relatorios" className={navClass}>
              <ChartBar size={17} weight="duotone" />
              Relatórios
            </NavLink>
            <NavLink to="/configuracoes" className={navClass}>
              <GearSix size={17} weight="duotone" />
              Configurações
            </NavLink>

            {/* Auditoria: contratos, aditivos, honorários e o vínculo das pastas */}
            <p className="mt-4 mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-zinc-500">
              Auditoria
            </p>
            <NavLink to="/auditoria/contratos" className={navClass}>
              <FileText size={17} weight="duotone" />
              Contratos
            </NavLink>
            <NavLink to="/auditoria/aditivos" className={navClass}>
              <FileText size={17} weight="duotone" />
              Aditivos
            </NavLink>
            <NavLink to="/auditoria/honorarios" className={navClass}>
              <CurrencyCircleDollar size={17} weight="duotone" />
              Honorários
            </NavLink>
            <NavLink to="/auditoria/pastas" className={navClass}>
              <FolderSimpleUser size={17} weight="duotone" />
              Vínculo de pastas
            </NavLink>
          </nav>

          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[11px] text-gray-400 dark:text-slate-500">
              41 Tech © {new Date().getFullYear()}
            </p>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
