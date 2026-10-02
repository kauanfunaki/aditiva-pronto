import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';

// Diálogo modal acessível: foco vai para dentro ao abrir, Tab fica preso no diálogo,
// Esc fecha e o foco volta para quem abriu.

interface Props {
  titulo:    string;
  aoFechar:  () => void;
  children:  ReactNode;
  rodape?:   ReactNode;
  largura?:  'md' | 'lg';
  /** Impede fechar (ex.: durante o envio). */
  travado?:  boolean;
}

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Dialogo({ titulo, aoFechar, children, rodape, largura = 'md', travado = false }: Props) {
  const idTitulo = useId();
  const caixa = useRef<HTMLDivElement>(null);
  const fechar = useRef(aoFechar);
  fechar.current = aoFechar;
  const travadoRef = useRef(travado);
  travadoRef.current = travado;

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const primeiro = caixa.current?.querySelector<HTMLElement>('[data-autofocus]')
      ?? caixa.current?.querySelector<HTMLElement>(FOCAVEIS);
    primeiro?.focus();

    function tecla(e: KeyboardEvent) {
      if (e.key === 'Escape' && !travadoRef.current) {
        e.stopPropagation();
        fechar.current();
        return;
      }
      if (e.key !== 'Tab' || !caixa.current) return;
      const itens = [...caixa.current.querySelectorAll<HTMLElement>(FOCAVEIS)];
      if (!itens.length) return;
      const [ini, fim] = [itens[0], itens[itens.length - 1]];
      if (e.shiftKey && document.activeElement === ini) { e.preventDefault(); fim.focus(); }
      else if (!e.shiftKey && document.activeElement === fim) { e.preventDefault(); ini.focus(); }
    }
    document.addEventListener('keydown', tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', tecla);
      document.body.style.overflow = overflow;
      anterior?.focus?.();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 dark:bg-black/70"
        onClick={() => { if (!travado) aoFechar(); }}
        aria-hidden="true"
      />
      <div
        ref={caixa}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitulo}
        className={`relative w-full ${largura === 'lg' ? 'max-w-3xl' : 'max-w-lg'} max-h-[90vh] flex flex-col
                    rounded-xl bg-white dark:bg-zinc-900 border border-gray-100 dark:border-zinc-800 shadow-xl`}
      >
        <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
          <h2 id={idTitulo} className="text-lg font-semibold text-gray-900 dark:text-zinc-100">{titulo}</h2>
          <button
            type="button"
            onClick={aoFechar}
            disabled={travado}
            className="p-2 -m-1 rounded-md text-gray-500 hover:bg-gray-100 dark:text-zinc-400 dark:hover:bg-zinc-800 disabled:opacity-40"
            aria-label="Fechar"
          >
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="px-5 pb-4 overflow-y-auto text-sm text-gray-700 dark:text-zinc-300">{children}</div>
        {rodape && (
          <div className="flex flex-wrap justify-end gap-2 px-5 py-4 border-t border-gray-100 dark:border-zinc-800">
            {rodape}
          </div>
        )}
      </div>
    </div>
  );
}
