import { useEffect, useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MagnifyingGlass, X } from '@phosphor-icons/react';
import { listCompanies } from '../../services/api';
import { maskCNPJ } from '../../utils/validators';

interface Props {
  nomePasta: string;
  ocupado:   boolean;
  onEscolher: (companyId: string) => void;
  onCancelar: () => void;
}

/** Busca uma empresa ativa (razão social ou CNPJ) para vincular à pasta. */
export function EmpresaPicker({ nomePasta, ocupado, onEscolher, onCancelar }: Props) {
  const inputId = useId();
  const [texto, setTexto] = useState('');
  const [termo, setTermo] = useState('');

  useEffect(() => {
    const t = setTimeout(() => setTermo(texto.trim()), 300);
    return () => clearTimeout(t);
  }, [texto]);

  const { data, isFetching } = useQuery({
    queryKey: ['companies', 'picker', termo],
    queryFn:  () => listCompanies({ search: termo, limit: 8 }),
    enabled:  termo.length >= 2,
  });

  return (
    <div className="rounded-lg border border-brand-200 dark:border-brand-800/60 bg-brand-50/40 dark:bg-brand-900/10 p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <label htmlFor={inputId} className="label mb-0">
          Empresa da pasta <span className="font-semibold">“{nomePasta}”</span>
        </label>
        <button type="button" onClick={onCancelar} className="btn-ghost px-2 py-1 min-h-[44px]" aria-label="Fechar busca de empresa">
          <X size={16} aria-hidden />
        </button>
      </div>

      <div className="relative">
        <MagnifyingGlass
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-zinc-500 pointer-events-none"
          aria-hidden
        />
        <input
          id={inputId}
          className="input pl-9"
          placeholder="Razão social ou CNPJ (mínimo 2 caracteres)"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          autoFocus
          autoComplete="off"
        />
      </div>

      <div className="mt-3" aria-live="polite">
        {termo.length < 2 ? null : isFetching && !data ? (
          <p className="text-sm text-gray-500 dark:text-zinc-400">Buscando…</p>
        ) : !data?.data.length ? (
          <p className="text-sm text-gray-500 dark:text-zinc-400">Nenhuma empresa ativa encontrada.</p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-zinc-800">
            {data.data.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-zinc-100 truncate">{c.razao_social}</p>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 font-mono">{maskCNPJ(c.cnpj)}</p>
                </div>
                <button
                  type="button"
                  className="btn-outline shrink-0 min-h-[44px]"
                  disabled={ocupado}
                  onClick={() => onEscolher(c.id)}
                >
                  Vincular
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
