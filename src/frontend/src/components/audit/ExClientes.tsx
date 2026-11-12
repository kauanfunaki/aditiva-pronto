import { UserMinus } from '@phosphor-icons/react';
import { maskCNPJ } from '../../utils/validators';
import type { AuditExCliente } from '../../types';

// Ex-clientes (pedido do Societário, 12/11/2026): empresa ainda ativa no app cuja pasta está em
// "009_EMPRESAS EX CLIENTES" fica fora da auditoria. O robô manda os nomes dessas pastas.

/** Linha do resumo, com a lista que abre ao clicar. */
export function ResumoExClientes({ exClientes }: { exClientes: AuditExCliente[] | undefined }) {
  if (!exClientes?.length) return null;
  return (
    <details className="mt-2 text-xs text-gray-500 dark:text-zinc-400">
      <summary className="cursor-pointer select-none hover:text-gray-700 dark:hover:text-zinc-200">
        {exClientes.length} ex-cliente(s) com a pasta em “Ex Clientes” ficaram fora da auditoria. Ver quais
      </summary>
      <ul className="mt-2 space-y-0.5 max-h-60 overflow-y-auto">
        {exClientes.map((e) => (
          <li key={e.id}>
            <span className="text-gray-700 dark:text-zinc-300">{e.razaoSocial}</span>{' '}
            <span className="font-mono">{maskCNPJ(e.cnpj)}</span> · pasta “{e.pasta}”
          </li>
        ))}
      </ul>
      <p className="mt-2">
        Se alguma delas ainda é cliente, mova a pasta de volta para a raiz da rede: na próxima sincronização ela volta para a auditoria.
      </p>
    </details>
  );
}

/** Aviso na linha: tem pasta ativa, mas também uma em Ex Clientes (cliente que voltou ou pasta esquecida). */
export function AvisoExCliente({ pasta }: { pasta: string | null }) {
  if (!pasta) return null;
  return (
    <p className="mt-1 flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300"
      title="A empresa tem pasta ativa na raiz e também uma pasta em Ex Clientes. Confira se ela ainda é cliente.">
      <UserMinus size={12} className="shrink-0 mt-0.5" aria-hidden />
      Também tem pasta em Ex Clientes (“{pasta}”)
    </p>
  );
}
